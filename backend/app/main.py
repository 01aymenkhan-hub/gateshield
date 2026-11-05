"""OCR API: bounded uploads, offloaded inference, backpressure and honest results."""
from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from concurrent.futures import ProcessPoolExecutor
import multiprocessing
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .ocr_engine import engine_settings, warmup_models
from .pipeline import InvalidImage, process_image
from .workers import initialize_worker, ready_worker, process_scan

logger = logging.getLogger("cnic-ocr")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif"}
MAX_UPLOAD_BYTES = int(os.getenv("OCR_MAX_UPLOAD_MB", "15")) * 1024 * 1024


class InferenceGate:
    """Finite active workers, finite queue, finite queue wait."""
    def __init__(self, queue_size: int = 4, timeout: float = 15.0, workers: int = 1):
        if queue_size < 0 or timeout <= 0 or not 1 <= workers <= 8:
            raise ValueError("OCR queue size/timeout must be nonnegative/positive")
        self.capacity = queue_size + workers
        self.timeout = timeout
        self.inflight = 0
        self.slot = asyncio.Semaphore(workers)

    @asynccontextmanager
    async def acquire(self):
        if self.inflight >= self.capacity:
            raise HTTPException(503, "OCR is busy. Please retry shortly.", headers={"Retry-After": "2"})
        self.inflight += 1
        acquired = False
        try:
            await asyncio.wait_for(self.slot.acquire(), timeout=self.timeout)
            acquired = True
            yield
        except TimeoutError as exc:
            raise HTTPException(503, "OCR queue wait expired. Please retry.", headers={"Retry-After": "2"}) from exc
        finally:
            if acquired:
                self.slot.release()
            self.inflight -= 1


@asynccontextmanager
async def lifespan(app: FastAPI):
    workers = int(os.getenv("OCR_WORKERS", "1"))
    app.state.gate = InferenceGate(int(os.getenv("OCR_QUEUE_SIZE", "4")),
                                  float(os.getenv("OCR_QUEUE_TIMEOUT_SECONDS", "15")), workers)
    app.state.workers = workers
    app.state.executor = None
    if workers == 1:
        import cv2
        cv2.setNumThreads(1)
        await run_in_threadpool(warmup_models)
    else:
        context = multiprocessing.get_context("spawn")
        app.state.executor = ProcessPoolExecutor(max_workers=workers,
            mp_context=context, initializer=initialize_worker,
            initargs=(context.Barrier(workers),))
    try:
        if app.state.executor:
            loop = asyncio.get_running_loop()
            await asyncio.gather(*(loop.run_in_executor(app.state.executor, ready_worker) for _ in range(workers)))
        yield
    finally:
        if app.state.executor:
            await run_in_threadpool(app.state.executor.shutdown, wait=True, cancel_futures=True)


app = FastAPI(title="CNIC OCR Backend", description="Field-aware CNIC and DLS OCR", version="0.4.0", lifespan=lifespan)
origins = [x.strip() for x in os.getenv("OCR_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class UploadLimitMiddleware:
    """Apply a total HTTP-body ceiling, including chunked multipart uploads."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST":
            return await self.app(scope, receive, send)
        size = 0
        # Multipart framing gets a small allowance, the file itself is bounded
        # separately. No trust in client-supplied Content-Length is required.
        async def limited_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > MAX_UPLOAD_BYTES + 64 * 1024:
                raise HTTPException(413, "Image upload exceeds the configured size limit.")
            return message
        await self.app(scope, limited_receive, send)


app.add_middleware(UploadLimitMiddleware)


@app.get("/")
async def root(request: Request):
    return {"status": "CNIC OCR backend is running", "version": "0.4.0", "engine": engine_settings()["engine"],
            "workers": request.app.state.workers, "oldCnicNames": "manual_entry"}


async def _scan(request: Request, file: UploadFile, document: str):
    if not file.filename:
        raise HTTPException(400, "No file provided.")
    if Path(file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Unsupported image file type.")
    try:
        contents = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Image upload exceeds the configured size limit.")
    finally:
        await file.close()
    queued = time.perf_counter()
    async with request.app.state.gate.acquire():
        queue_ms = round((time.perf_counter() - queued) * 1000, 2)
        try:
            if request.app.state.executor:
                job = asyncio.get_running_loop().run_in_executor(request.app.state.executor, process_scan, contents, document)
                try:
                    # A disconnected client must not free a slot while its
                    # process is still running and grow a hidden executor queue.
                    result = await asyncio.shield(job)
                except asyncio.CancelledError:
                    try:
                        await asyncio.shield(job)
                    except Exception:
                        pass
                    raise
            else:
                started = time.time_ns()
                result = await run_in_threadpool(process_image, contents, document)
                result["timing"].update(workerId=os.getpid(), workerStartedNs=started,
                                        workerFinishedNs=time.time_ns())
        except InvalidImage as exc:
            raise HTTPException(exc.status_code, str(exc), headers={"Retry-After": "2"} if exc.status_code == 503 else None) from exc
        except Exception as exc:
            # Keep internal paths/model errors out of API responses.
            logger.exception("OCR processing failed document=%s", document)
            raise HTTPException(500, "OCR processing failed. Please retry or contact the operator.") from exc
    result["timing"]["queueMs"] = queue_ms
    return result


@app.post("/scan-cnic")
async def scan_cnic(request: Request, file: UploadFile = File(...)):
    return await _scan(request, file, "cnic")


@app.post("/scan-dls")
async def scan_dls(request: Request, file: UploadFile = File(...)):
    return await _scan(request, file, "dls")
