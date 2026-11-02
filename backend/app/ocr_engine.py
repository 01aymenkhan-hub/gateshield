"""
OCR Engine — PaddleOCR wrapper

Initializes PaddleOCR once per process and exposes a clean `run_ocr()` function
that accepts either an image file path (str) or an in-memory numpy array.

Optimizations:
- Disables slow doc unwarping and doc orientation classify (cuts CPU latency dramatically).
- Supports PaddleOCR 3.x and 2.x return schemas.

Concurrency notes:
- The model is created lazily on first use (or explicitly via `get_ocr()`), so the
  FastAPI API process does not load PaddleOCR when OCR runs in dedicated worker
  processes. Each worker process owns exactly one PaddleOCR instance; a single
  instance is never shared across processes or concurrent threads.
- Model, language, and pipeline options are identical to the original singleton.
  The only optional addition is `cpu_threads`, applied when the
  `OCR_CPU_THREADS` environment variable is set (PaddleOCR's default is used otherwise).
- Lightweight, non-invasive timing proxies record text detection and text
  recognition durations without altering their inputs or outputs.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Union

import numpy as np

logger = logging.getLogger("cnic-ocr.engine")

# ---------------------------------------------------------------------------
# Per-process stage timing (detection / recognition / OCR call counters)
# ---------------------------------------------------------------------------
_timings_local = threading.local()


def _timings() -> dict[str, float]:
    data = getattr(_timings_local, "data", None)
    if data is None:
        data = {}
        _timings_local.data = data
    return data


def _add_timing(key: str, seconds: float) -> None:
    data = _timings()
    data[key] = data.get(key, 0.0) + seconds


def reset_stage_timings() -> None:
    """Clear detection/recognition/OCR-call timings for the current thread."""
    _timings_local.data = {}


def get_stage_timings() -> dict[str, float]:
    """Return a copy of detection/recognition/OCR-call timings for the current thread."""
    return dict(_timings())


class _TimedPredictor:
    """
    Transparent proxy around a PaddleX predictor.

    The OCR pipeline calls predictors as `predictor(inputs, **kwargs)` and consumes
    the returned generator. This proxy consumes that generator inside a timer and
    yields exactly the same results, so OCR behaviour and output are unchanged.
    All other attribute access is delegated to the wrapped predictor.
    """

    def __init__(self, inner: Any, timing_key: str):
        object.__setattr__(self, "_inner", inner)
        object.__setattr__(self, "_timing_key", timing_key)

    def __call__(self, *args: Any, **kwargs: Any):
        start = time.perf_counter()
        results = list(self._inner(*args, **kwargs))
        _add_timing(self._timing_key, time.perf_counter() - start)
        return iter(results)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)

    def __setattr__(self, name: str, value: Any) -> None:
        setattr(self._inner, name, value)


def _install_timing_proxies(ocr_instance: Any) -> None:
    """Wrap text detection/recognition predictors with timing proxies (best effort)."""
    try:
        wrapper = getattr(ocr_instance, "paddlex_pipeline", None)
        inner = getattr(wrapper, "_pipeline", None)
        if inner is None:
            logger.info("OCR stage timing proxies not installed (pipeline internals unavailable).")
            return
        for attr, key in (("text_det_model", "detection_s"), ("text_rec_model", "recognition_s")):
            predictor = getattr(inner, attr, None)
            if predictor is not None and not isinstance(predictor, _TimedPredictor):
                setattr(inner, attr, _TimedPredictor(predictor, key))
    except Exception as exc:  # pragma: no cover - timing must never break OCR
        logger.warning("Could not install OCR stage timing proxies: %s", exc)


# ---------------------------------------------------------------------------
# Initialise PaddleOCR (lazy per-process singleton)
# ---------------------------------------------------------------------------
_ocr = None
_ocr_lock = threading.Lock()


def get_ocr():
    """Create (once per process) and return the PaddleOCR instance."""
    global _ocr
    if _ocr is None:
        with _ocr_lock:
            if _ocr is None:
                from paddleocr import PaddleOCR

                kwargs: dict[str, Any] = dict(
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                    lang="en",
                    device="cpu",
                )
                cpu_threads = os.environ.get("OCR_CPU_THREADS", "").strip()
                if cpu_threads.isdigit() and int(cpu_threads) > 0:
                    kwargs["cpu_threads"] = int(cpu_threads)

                instance = PaddleOCR(**kwargs)
                _install_timing_proxies(instance)
                _ocr = instance
                logger.info(
                    "PaddleOCR initialised in pid=%s (cpu_threads=%s)",
                    os.getpid(),
                    kwargs.get("cpu_threads", "default"),
                )
    return _ocr


def run_ocr(image_input: Union[str, np.ndarray]) -> dict[str, Any]:
    """
    Run PaddleOCR on the given image path or numpy ndarray.

    Parameters
    ----------
    image_input : str or np.ndarray
        Absolute path to an image file or a BGR numpy array.

    Returns
    -------
    dict with keys:
        success : bool
        text    : list[str]          – plain detected text lines
        results : list[dict]         – text + confidence + bounding box
        details : list[dict]         – alias of results
    """
    ocr = get_ocr()
    call_start = time.perf_counter()
    result = ocr.ocr(image_input)
    _add_timing("ocr_calls_s", time.perf_counter() - call_start)
    _add_timing("ocr_call_count", 1)

    text_lines: list[str] = []
    details: list[dict[str, Any]] = []

    if not result:
        return {"success": True, "text": [], "results": [], "details": []}

    item = result[0]

    # ── PaddleOCR 3.x structure (dict with rec_texts, rec_scores, rec_polys) ──
    if isinstance(item, dict):
        rec_texts = item.get("rec_texts", [])
        rec_scores = item.get("rec_scores", [])
        rec_polys = item.get("rec_polys", item.get("dt_polys", []))

        for i, text in enumerate(rec_texts):
            score = float(rec_scores[i]) if i < len(rec_scores) else 1.0
            bbox = rec_polys[i] if i < len(rec_polys) else []
            if hasattr(bbox, "tolist"):
                bbox = bbox.tolist()

            text_lines.append(text)
            details.append({
                "text": text,
                "confidence": round(float(score), 4),
                "bbox": bbox,
            })

    # ── PaddleOCR 2.x structure (list of [[bbox], (text, score)]) ──
    elif isinstance(item, list):
        for detection in item:
            bbox = detection[0]
            if hasattr(bbox, "tolist"):
                bbox = bbox.tolist()
            text = str(detection[1][0])
            confidence = float(detection[1][1])

            text_lines.append(text)
            details.append({
                "text": text,
                "confidence": round(confidence, 4),
                "bbox": bbox,
            })

    return {
        "success": True,
        "text": text_lines,
        "results": details,
        "details": details,
    }
