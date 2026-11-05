"""Process-isolated OCR predictors; a predictor is never shared by threads."""
from __future__ import annotations

import os
import time

from .ocr_engine import warmup_models
from .pipeline import process_image


def initialize_worker(barrier=None) -> None:
    import cv2
    cv2.setNumThreads(1)
    warmup_models()
    if barrier is not None:
        barrier.wait(timeout=180)


def ready_worker() -> int:
    return os.getpid()


def process_scan(contents: bytes, document: str) -> dict:
    start = time.time_ns()
    result = process_image(contents, document)
    result["timing"].update(workerId=os.getpid(), workerStartedNs=start,
                            workerFinishedNs=time.time_ns())
    return result
