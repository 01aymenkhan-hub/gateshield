"""
CNIC OCR Backend — FastAPI Application

Implements the field-aware OCR pipeline:
1. Normalizes card boundary and perspective.
2. Applies CLAHE enhancement and unsharp masking.
3. Performs Pass 1 full-card OCR.
4. Uses relative region matching and strict field validators.
5. Performs targeted crop OCR fallback for any missing or invalid field.
6. Returns structured 8-field JSON.

Concurrency:
The CPU-heavy pipeline above (see `ocr_pipeline.py`) runs in dedicated OCR
worker processes (see `ocr_worker.py`) so the FastAPI event loop stays
responsive and multiple scans are processed in parallel. Request/response
formats, validation, and error messages are unchanged.
"""

import json
import os
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .ocr_worker import InvalidImageError, OcrWorkerPool

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif"}

# Benchmark-only: when "1", adds an X-OCR-Timing header with stage timings.
# Disabled by default; never enable on the public production server.
OCR_TIMING_HEADER = os.environ.get("OCR_TIMING_HEADER", "").strip() == "1"

logger = logging.getLogger("cnic-ocr")

# Internal per-request timing log (stdout of the OCR service only).
timing_logger = logging.getLogger("cnic-ocr.timing")
if not timing_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s"))
    timing_logger.addHandler(_handler)
    timing_logger.setLevel(logging.INFO)
    timing_logger.propagate = False

worker_logger = logging.getLogger("cnic-ocr.worker")
if not worker_logger.handlers:
    _whandler = logging.StreamHandler()
    _whandler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s"))
    worker_logger.addHandler(_whandler)
    worker_logger.setLevel(logging.INFO)
    worker_logger.propagate = False

ocr_pool = OcrWorkerPool()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    await asyncio.to_thread(ocr_pool.start)
    try:
        yield
    finally:
        ocr_pool.shutdown()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="CNIC OCR Backend",
    description="Field-aware Pakistani CNIC OCR Service",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_upload(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )


def _respond(response: dict, timings: dict, request_started: float, read_s: float, size: int):
    timings["upload_read_s"] = round(read_s, 4)
    timings["upload_bytes"] = size
    timings["request_total_s"] = round(time.perf_counter() - request_started, 4)
    timings["ipc_and_dispatch_s"] = round(
        max(
            0.0,
            timings["request_total_s"]
            - read_s
            - timings.get("queue_wait_s", 0.0)
            - timings.get("processing_total_s", 0.0),
        ),
        4,
    )
    timing_logger.info("ocr_timing %s", json.dumps(timings, separators=(",", ":")))

    if OCR_TIMING_HEADER:
        return JSONResponse(
            content=response,
            headers={"X-OCR-Timing": json.dumps(timings, separators=(",", ":"))},
        )
    return response


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    """Health-check endpoint."""
    return {"status": "CNIC OCR backend is running", "version": "0.2.0"}


@app.post("/scan-cnic")
async def scan_cnic(file: UploadFile = File(...)):
    """
    Receive a CNIC image, normalize, preprocess, run targeted OCR,
    and return the structured 8-field result.
    """
    request_started = time.perf_counter()
    _validate_upload(file)

    try:
        t = time.perf_counter()
        contents = await file.read()
        read_s = time.perf_counter() - t

        response, timings = await ocr_pool.submit("cnic", contents)
        return _respond(response, timings, request_started, read_s, len(contents))

    except InvalidImageError:
        raise HTTPException(status_code=400, detail="Invalid image file or format.")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("OCR processing failed")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@app.post("/scan-dls")
async def scan_dls(file: UploadFile = File(...)):
    """
    Receive a Driving License Sindh image, normalize, preprocess,
    run OCR, parse DLS fields, and return structured 8-field result.
    """
    request_started = time.perf_counter()
    _validate_upload(file)

    try:
        t = time.perf_counter()
        contents = await file.read()
        read_s = time.perf_counter() - t

        response, timings = await ocr_pool.submit("dls", contents)
        return _respond(response, timings, request_started, read_s, len(contents))

    except InvalidImageError:
        raise HTTPException(status_code=400, detail="Invalid image file or format.")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("DLS OCR processing failed")
        raise HTTPException(status_code=500, detail=f"DLS OCR processing failed: {str(e)}")
