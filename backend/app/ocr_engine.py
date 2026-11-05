"""Pinned FP32 OCR models, loaded once per worker. No tiny-model shortcuts."""
from __future__ import annotations

import os
import threading
from typing import Any

import numpy as np

_init_lock = threading.RLock()
_ocr: Any = None
_urdu_recognizer: Any = None
_orientation: Any = None


def engine_settings() -> dict[str, Any]:
    engine = os.getenv("OCR_ENGINE", "onnxruntime")
    if engine not in {"onnxruntime", "paddle"}:
        raise ValueError("OCR_ENGINE must be onnxruntime or paddle")
    threads = int(os.getenv("OCR_CPU_THREADS", str(min(4, os.cpu_count() or 1))))
    if not 1 <= threads <= 64:
        raise ValueError("OCR_CPU_THREADS must be between 1 and 64")
    settings: dict[str, Any] = {
        "engine": engine, "device": "cpu",
        "text_detection_model_name": "PP-OCRv6_medium_det",
        "text_recognition_model_name": "PP-OCRv6_medium_rec",
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False, "use_textline_orientation": False,
    }
    if engine == "onnxruntime":
        settings["engine_config"] = {
            "intra_op_num_threads": threads, "inter_op_num_threads": 1,
            "log_severity_level": 3,
        }
    else:
        settings.update(cpu_threads=threads, enable_mkldnn=True)
    for name in ("text_detection_model_dir", "text_recognition_model_dir"):
        if value := os.getenv("OCR_" + name.upper()):
            settings[name] = value
    return settings


def get_engine() -> Any:
    global _ocr
    with _init_lock:
        if _ocr is None:
            from paddleocr import PaddleOCR
            _ocr = PaddleOCR(**engine_settings())
    return _ocr


def normalize_results(result: Any) -> dict[str, Any]:
    """Preserve the existing JSON contract without duplicate inference."""
    details: list[dict[str, Any]] = []
    if result:
        item = result[0]
        if isinstance(item, dict):
            texts = item.get("rec_texts", [])
            scores = item.get("rec_scores", [])
            polygons = item.get("rec_polys", item.get("dt_polys", []))
            for i, text in enumerate(texts):
                bbox = polygons[i] if i < len(polygons) else []
                if hasattr(bbox, "tolist"):
                    bbox = bbox.tolist()
                details.append({"text": str(text), "confidence": round(float(scores[i]), 4)
                                if i < len(scores) else 0.0, "bbox": bbox})
        elif isinstance(item, list):
            for bbox, (text, score) in item:
                if hasattr(bbox, "tolist"):
                    bbox = bbox.tolist()
                details.append({"text": str(text), "confidence": round(float(score), 4), "bbox": bbox})
    return {"success": bool(details), "text": [d["text"] for d in details],
            "results": details, "details": details}


def run_ocr(image_input: str | np.ndarray) -> dict[str, Any]:
    return normalize_results(get_engine().predict(image_input))


def orient_image(image: np.ndarray) -> tuple[np.ndarray, int]:
    """Cheap 4-way orientation before normalization preserves card geometry."""
    global _orientation
    with _init_lock:
        if _orientation is None:
            from paddleocr import DocImgOrientationClassification
            settings = engine_settings()
            _orientation = DocImgOrientationClassification(
                model_name="PP-LCNet_x1_0_doc_ori", device="cpu", engine=settings["engine"],
                **({"engine_config": settings["engine_config"]}
                   if "engine_config" in settings else {"cpu_threads": settings["cpu_threads"]}),
                **({"model_dir": os.environ["OCR_ORIENTATION_MODEL_DIR"]}
                   if os.getenv("OCR_ORIENTATION_MODEL_DIR") else {}),
            )
    result = list(_orientation.predict(image))[0]
    angle = int(result["label_names"][0])
    if angle not in {0, 90, 180, 270}:
        raise RuntimeError("Unsupported document orientation result")
    return np.ascontiguousarray(np.rot90(image, angle // 90)) if angle else image, angle


def recognize_urdu(crops: list[np.ndarray]) -> list[dict[str, Any]]:
    """Real old-card script recognition. Callers reject uncertain text."""
    global _urdu_recognizer
    if not crops or os.getenv("OCR_ENABLE_URDU", "true").lower() != "true":
        return []
    with _init_lock:
        if _urdu_recognizer is None:
            from paddleocr import TextRecognition
            settings = engine_settings()
            _urdu_recognizer = TextRecognition(
                model_name="arabic_PP-OCRv5_mobile_rec", device="cpu",
                engine=settings["engine"],
                **({"engine_config": settings["engine_config"]}
                   if "engine_config" in settings else {"cpu_threads": settings["cpu_threads"]}),
                **({"model_dir": os.environ["OCR_URDU_MODEL_DIR"]}
                   if os.getenv("OCR_URDU_MODEL_DIR") else {}),
            )
    return [{"text": str(r.get("rec_text", "")), "confidence": float(r.get("rec_score", 0))}
            for r in _urdu_recognizer.predict(crops)]


def warmup_models() -> None:
    """Download/load models before accepting uploads, not during a visitor scan."""
    get_engine()
    orient_image(np.full((256, 400, 3), 255, dtype=np.uint8))
