"""
OCR worker-process pool.

Runs the unchanged CNIC/DLS OCR pipeline in dedicated worker processes so that
CPU-heavy PaddleOCR inference never blocks the FastAPI event loop.

Design
------
- `OCR_WORKERS` (default 3) spawned worker processes via ProcessPoolExecutor.
- Each worker loads its OWN PaddleOCR instance once (in the process initializer)
  and runs a warm-up inference. No predictor is shared across processes/threads.
- Each worker executes exactly one OCR job at a time; pending jobs wait in the
  executor's FIFO work queue (first come, first served).
- `OCR_CPU_THREADS` (default 2) Paddle CPU threads per worker. OMP_NUM_THREADS /
  MKL_NUM_THREADS / OPENBLAS_NUM_THREADS are set to the same value before Paddle
  loads, and OpenCV is limited to 1 thread per worker.
- `OCR_WORKERS=0` keeps OCR in the API process (run in a background thread behind
  a lock): non-blocking for the event loop, but sequential like the original
  implementation. Useful as a quick rollback switch.
- If a worker process crashes, the pool is recreated automatically and the
  affected request fails with the existing 500 error format.

This module intentionally keeps heavy imports (PaddleOCR / pipeline) inside
functions so the API process does not load the OCR model when workers are used.
"""

from __future__ import annotations

import asyncio
import logging
import multiprocessing
import os
import sys
import threading
import time
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Any, Optional

logger = logging.getLogger("cnic-ocr.worker")

THREAD_ENV_KEYS = ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS")


class InvalidImageError(ValueError):
    """Uploaded bytes could not be decoded into an image (maps to HTTP 400)."""


def _env_int(name: str, default: int, minimum: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        value = int(raw) if raw else default
    except ValueError:
        value = default
    return max(minimum, value)


def _process_metrics() -> dict[str, Any]:
    """Best-effort RSS / CPU time of the current process (requires psutil)."""
    try:
        import psutil

        proc = psutil.Process()
        mem = proc.memory_info()
        cpu = proc.cpu_times()
        return {
            "worker_rss_mb": round(mem.rss / (1024 * 1024), 1),
            "worker_cpu_total_s": round(cpu.user + cpu.system, 2),
        }
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Worker-process side
# ---------------------------------------------------------------------------
def _init_worker(cpu_threads: int) -> None:
    """Process initializer: limit threads, load PaddleOCR once, warm up."""
    os.environ["OCR_CPU_THREADS"] = str(cpu_threads)
    for key in THREAD_ENV_KEYS:
        os.environ[key] = str(cpu_threads)

    if not logging.getLogger("cnic-ocr.worker").handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s"))
        wl = logging.getLogger("cnic-ocr.worker")
        wl.addHandler(handler)
        wl.setLevel(logging.INFO)
        wl.propagate = False

    import cv2
    import numpy as np

    cv2.setNumThreads(1)

    from .ocr_engine import get_ocr, run_ocr

    t = time.perf_counter()
    get_ocr()
    load_s = time.perf_counter() - t

    # Warm-up: run one detection + recognition so the first real request
    # does not pay one-time oneDNN/MKL-DNN initialisation cost.
    t = time.perf_counter()
    try:
        canvas = np.full((630, 1000, 3), 255, dtype=np.uint8)
        cv2.putText(canvas, "GATESHIELD 12345-1234567-1", (40, 320),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 0, 0), 3, cv2.LINE_AA)
        run_ocr(canvas)
    except Exception as exc:  # warm-up must never prevent startup
        logging.getLogger("cnic-ocr.worker").warning("Warm-up inference failed: %s", exc)
    warm_s = time.perf_counter() - t

    logging.getLogger("cnic-ocr.worker").info(
        "OCR worker ready pid=%s cpu_threads=%s model_load=%.1fs warmup=%.1fs %s",
        os.getpid(), cpu_threads, load_s, warm_s, _process_metrics(),
    )


def _ping(hold_seconds: float = 0.0) -> dict[str, Any]:
    """Returns once this worker is initialised (used for startup readiness)."""
    if hold_seconds:
        time.sleep(hold_seconds)
    return {"pid": os.getpid(), **_process_metrics()}


def _run_job(kind: str, contents: bytes, submitted_wall: float) -> dict[str, Any]:
    """Execute one CNIC/DLS job. Runs inside a worker (or the API thread in in-process mode)."""
    started_wall = time.time()
    from .ocr_pipeline import InvalidImageError as PipelineInvalidImage
    from .ocr_pipeline import process_cnic, process_dls

    try:
        if kind == "cnic":
            response, timings = process_cnic(contents)
        elif kind == "dls":
            response, timings = process_dls(contents)
        else:
            raise ValueError(f"Unknown OCR job kind: {kind}")
    except PipelineInvalidImage:
        return {"status": "invalid"}
    except Exception as exc:
        logging.getLogger("cnic-ocr").exception("%s OCR processing failed in worker", kind.upper())
        # Re-raise as a plain RuntimeError so it always pickles back to the API
        # process while keeping the original message for the existing error format.
        raise RuntimeError(str(exc)) from None

    timings["queue_wait_s"] = round(max(0.0, started_wall - submitted_wall), 4)
    timings["worker_pid"] = os.getpid()
    timings.update(_process_metrics())
    return {"status": "ok", "response": response, "timings": timings}


# ---------------------------------------------------------------------------
# API-process side
# ---------------------------------------------------------------------------
class OcrWorkerPool:
    """Owns the OCR worker processes and dispatches jobs to them FIFO."""

    def __init__(self, workers: Optional[int] = None, cpu_threads: Optional[int] = None):
        self.workers = workers if workers is not None else _env_int("OCR_WORKERS", 3, 0)
        self.cpu_threads = cpu_threads if cpu_threads is not None else _env_int("OCR_CPU_THREADS", 2, 1)
        self._executor: Optional[ProcessPoolExecutor] = None
        self._restart_lock = threading.Lock()
        self._inprocess_lock = threading.Lock()
        self._in_flight = 0
        self._ready = False

    # ── lifecycle ──
    def _create_executor(self) -> ProcessPoolExecutor:
        # Children inherit these, so thread limits apply before Paddle loads.
        os.environ["OCR_CPU_THREADS"] = str(self.cpu_threads)
        for key in THREAD_ENV_KEYS:
            os.environ[key] = str(self.cpu_threads)
        return ProcessPoolExecutor(
            max_workers=self.workers,
            mp_context=multiprocessing.get_context("spawn"),
            initializer=_init_worker,
            initargs=(self.cpu_threads,),
        )

    def _warm_up(self, timeout_s: float = 600.0) -> list[int]:
        """Block until every worker process has loaded its model."""
        assert self._executor is not None
        seen: set[int] = set()
        deadline = time.time() + timeout_s
        while len(seen) < self.workers and time.time() < deadline:
            futures = [self._executor.submit(_ping, 1.5) for _ in range(self.workers)]
            for fut in futures:
                seen.add(fut.result(timeout=max(1.0, deadline - time.time()))["pid"])
        if len(seen) < self.workers:
            logger.warning("Only %d/%d OCR workers confirmed ready", len(seen), self.workers)
        return sorted(seen)

    def start(self) -> None:
        if self.workers == 0:
            os.environ.setdefault("OCR_CPU_THREADS", str(self.cpu_threads))
            from .ocr_engine import get_ocr

            get_ocr()
            self._ready = True
            logger.info("OCR running in-process (OCR_WORKERS=0), cpu_threads=%s", self.cpu_threads)
            return

        t = time.perf_counter()
        self._executor = self._create_executor()
        pids = self._warm_up()
        self._ready = True
        logger.info(
            "OCR worker pool ready: workers=%d cpu_threads=%d pids=%s startup=%.1fs",
            self.workers, self.cpu_threads, pids, time.perf_counter() - t,
        )

    def shutdown(self) -> None:
        if self._executor is not None:
            self._executor.shutdown(wait=False, cancel_futures=True)
            self._executor = None
        self._ready = False

    def _restart(self, broken: ProcessPoolExecutor) -> None:
        with self._restart_lock:
            if self._executor is not broken:
                return  # already restarted by another request
            logger.error("OCR worker pool broken (worker crashed); recreating pool")
            try:
                broken.shutdown(wait=False, cancel_futures=True)
            except Exception:
                pass
            self._executor = self._create_executor()

    # ── dispatch ──
    @property
    def in_flight(self) -> int:
        return self._in_flight

    def _run_inprocess(self, kind: str, contents: bytes, submitted_wall: float) -> dict[str, Any]:
        with self._inprocess_lock:
            return _run_job(kind, contents, submitted_wall)

    async def submit(self, kind: str, contents: bytes) -> tuple[dict[str, Any], dict[str, Any]]:
        """Queue one OCR job (FIFO) and await its result without blocking the event loop."""
        loop = asyncio.get_running_loop()
        submitted_wall = time.time()
        self._in_flight += 1
        queue_depth_at_submit = self._in_flight
        try:
            if self.workers == 0:
                result = await loop.run_in_executor(
                    None, self._run_inprocess, kind, contents, submitted_wall
                )
            else:
                executor = self._executor
                if executor is None:
                    raise RuntimeError("OCR worker pool is not running")
                try:
                    result = await loop.run_in_executor(
                        executor, _run_job, kind, contents, submitted_wall
                    )
                except BrokenProcessPool:
                    await asyncio.to_thread(self._restart, executor)
                    raise RuntimeError("OCR worker process stopped unexpectedly; please retry")
        finally:
            self._in_flight -= 1

        if result.get("status") == "invalid":
            raise InvalidImageError("Invalid image file or format.")

        timings = result["timings"]
        timings["in_flight_at_submit"] = queue_depth_at_submit
        return result["response"], timings
