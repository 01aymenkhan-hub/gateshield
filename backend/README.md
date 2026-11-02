# CNIC OCR Backend

A Python FastAPI backend powered by **PaddleOCR** for extracting text from Pakistani Computerised National Identity Cards (CNIC).

---

## 1. Environment Details

- **Python Version:** Python 3.12.10 (64-bit)
- **Virtual Environment:** `backend/venv`
- **OCR Engine:** PaddleOCR 3.7.0 (with PaddlePaddle 3.3.1)
- **Execution Mode:** CPU-only (optimized for local development without GPU/CUDA)
- **Framework:** FastAPI 0.141.1 + Uvicorn 0.54.0

---

## 2. Directory Structure

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI application & endpoints (GET /, POST /scan-cnic, POST /scan-dls)
│   ├── ocr_engine.py    # Lazy per-process PaddleOCR wrapper (supports PaddleOCR 3.x) + stage timers
│   ├── ocr_pipeline.py  # CNIC/DLS processing pipeline executed inside OCR workers
│   └── ocr_worker.py    # OCR worker-process pool (FIFO, one job per worker)
├── uploads/             # Temporary folder for received image files (auto-cleaned)
├── venv/                # Python 3.12 virtual environment
├── create_test_cnic.py  # Utility to generate synthetic test CNIC image
├── test_cnic.png        # Sample test image used for validation
├── requirements.txt     # Exact pinned requirements
└── README.md            # This documentation
```

---

## 3. How to Activate the Virtual Environment

### PowerShell
```powershell
& ".\venv\Scripts\Activate.ps1"
```
Or directly reference the python executable:
```powershell
& ".\venv\Scripts\python.exe" <script.py>
```

### Command Prompt (cmd)
```cmd
venv\Scripts\activate.bat
```

---

## 4. How to Install Dependencies

```powershell
& ".\venv\Scripts\pip.exe" install -r requirements.txt
```

---

## 5. How to Start FastAPI

From the `backend/` directory:

```powershell
& ".\venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

## 6. URLs

- **Base URL / Health Check:** [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **Interactive Swagger Documentation:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **OpenAPI JSON Specification:** [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 7. How to Test `/scan-cnic`

### Option A: Using Swagger UI
1. Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) in your browser.
2. Expand the `POST /scan-cnic` section.
3. Click **Try it out**.
4. Select a CNIC image (e.g. `test_cnic.png`).
5. Click **Execute** and observe the JSON response.

### Option B: Using Python `requests`
```python
import requests
import json

url = "http://127.0.0.1:8000/scan-cnic"
files = {"file": open("test_cnic.png", "rb")}
response = requests.post(url, files=files)
print(json.dumps(response.json(), indent=2))
```

### Option C: Using cURL
```bash
curl -X POST "http://127.0.0.1:8000/scan-cnic" \
     -H "accept: application/json" \
     -H "Content-Type: multipart/form-data" \
     -F "file=@test_cnic.png"
```

---

## 8. Example Output from Real CNIC Image

```json
{
  "success": true,
  "text": [
    "SLAMIC REPUBLIC OF PAKISTAN",
    "National Identity Card",
    "Name:",
    "MUHAMMAD ASIM",
    "Father Name:",
    "MUHAMMAD IQBAL",
    "Gender:",
    "M",
    "[PHOTO]",
    "Country of Stay:",
    "Pakistan",
    "dentity Number:",
    "42101-1234567-1",
    "Date of Birth:",
    "01.01.2002",
    "ate of Issue:",
    "10.05.2020",
    "te of Expiry.",
    "10.05.2030"
  ],
  "details": [
    {
      "text": "MUHAMMAD ASIM",
      "confidence": 0.9951,
      "bbox": [[199, 68], [291, 65], [291, 82], [199, 84]]
    },
    {
      "text": "MUHAMMAD IQBAL",
      "confidence": 0.9725,
      "bbox": [[197, 112], [296, 108], [296, 125], [197, 128]]
    },
    {
      "text": "42101-1234567-1",
      "confidence": 1.0,
      "bbox": [[198, 247], [291, 245], [291, 262], [198, 264]]
    }
  ]
}
```

---

## 9. Compatibility & Implementation Notes

1. **PaddleOCR 3.x Compatibility:** In PaddleOCR 3.7+, the initialization parameter `show_log` is deprecated and removed; the engine accepts `lang="en"` and `device="cpu"`. Output format returns a dictionary with `rec_texts`, `rec_scores`, and `rec_polys`. `ocr_engine.py` is implemented to handle both PaddleOCR 3.x and 2.x return schemas gracefully.
2. **CPU Execution:** Configured to run on standard CPU without requiring CUDA or PyTorch.
3. **Frontend Isolation:** The Next.js frontend preserves the mock scanner (`scanCnicMock`), while exposing the real OCR API endpoint (`scanCnicReal`) in `src/services/cnicApi.ts`.
4. **Temporary Upload Cleanup:** All uploaded images sent to `POST /scan-cnic` are written to a temporary UUID file in `backend/uploads/` and deleted immediately inside a `finally` block once inference completes.

---

## 10. Exact Commands to Restart Backend

```powershell
# In a PowerShell terminal at the project root:
cd "d:\Mehmood\cnic-ocr system\backend"
& ".\venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

> Run a **single** Uvicorn process (do not add `--workers`). OCR parallelism comes from the
> dedicated OCR worker processes described below. Avoid `--reload` in production.

---

## 11. OCR Concurrency (Worker Processes)

CPU-heavy OCR runs in dedicated worker processes so the FastAPI event loop is never blocked
and several scans are processed in parallel:

```text
Request ─► FastAPI (async, 1 process) ─► FIFO queue ─► OCR worker 1 (own PaddleOCR)
                                                    ├─► OCR worker 2 (own PaddleOCR)
                                                    └─► OCR worker 3 (own PaddleOCR)
```

- `app/ocr_worker.py`: worker pool (spawned processes, FIFO, one job per worker, warm-up, crash recovery)
- `app/ocr_pipeline.py`: the unchanged CNIC/DLS pipeline + per-stage timings
- `app/ocr_engine.py`: lazy per-process PaddleOCR (same models/options) + detection/recognition timers

| Environment variable | Default | Meaning |
|---|---|---|
| `OCR_WORKERS` | `3` | Number of OCR worker processes. `0` = run OCR in the API process (sequential, rollback mode). |
| `OCR_CPU_THREADS` | `2` | Paddle CPU threads per worker. `OMP_NUM_THREADS` / `MKL_NUM_THREADS` / `OPENBLAS_NUM_THREADS` are set to the same value for workers; OpenCV uses 1 thread per worker. |
| `OCR_TIMING_HEADER` | off | Benchmarking only: `1` adds an `X-OCR-Timing` response header. Keep off in production. |

Each OCR request logs one internal timing line (`cnic-ocr.timing ocr_timing {...}`) with
decode, preprocessing, detection, recognition, crop/fallback passes, queue wait and totals.
Startup takes longer than before because every worker loads its own model and runs a warm-up
inference; the service only reports ready once all workers are loaded.

### Benchmark

```powershell
# terminal 1 (benchmark mode)
$env:OCR_TIMING_HEADER="1"; & ".\venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# terminal 2
& ".\venv\Scripts\python.exe" benchmark_ocr.py --url http://127.0.0.1:8000 --label server_3x2 --out results_server_3x2.json
& ".\venv\Scripts\python.exe" benchmark_ocr.py --compare results_baseline.json results_server_3x2.json
```
