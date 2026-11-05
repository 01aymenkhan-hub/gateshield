# CNIC and driving licence OCR

FastAPI with PaddleOCR 3.7 models running on ONNX Runtime CPU by default.
The detector and recognizer remain PP-OCRv6 **medium FP32** models. A document
orientation classifier corrects rotation before resizing. Smaller recognition
models were evaluated and rejected because licence field accuracy decreased.

## Run

On this configured PC, run `npm run dev:backend` from the repository root.
It loads `backend/.env`, including the Python executable and model cache paths,
and binds OCR to localhost. Database/frontend startup is in `../LOCAL_SETUP.md`.

Use Python 3.12, 64-bit, from `backend`:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
$env:OCR_CPU_THREADS = '4'
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Set the Next.js server's `FASTAPI_URL` to the private backend URL. Production
OCR should be behind the authenticated application or a private network; these
endpoints do not themselves authenticate users. Keep one Uvicorn worker for a
single CPU model owner. Each extra worker loads another complete model set.

Startup loads the medium OCR and orientation models. Old Urdu CNIC name rows
use a separate, authenticated localhost vision worker, only when needed.
The first startup needs network access to download public model weights and
convert/cache ONNX files. Provision the cache during deployment, make it
writable, and retain it across restarts. Uploads are decoded in memory; the
FastAPI does not persist inference uploads or send them to a cloud OCR provider.
The authenticated web check-in workflow separately saves accepted document photos
in private storage; see `../DEPLOYMENT.md` for image persistence and backups.
Do not enable request-body logging in the reverse proxy.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OCR_ENGINE` | `onnxruntime` | `onnxruntime` or `paddle` for comparison |
| `OCR_CPU_THREADS` | Up to 4 | CPU inference threads, range 1–64 |
| `OCR_QUEUE_SIZE` | `4` | Waiting scans, plus one active scan |
| `OCR_QUEUE_TIMEOUT_SECONDS` | `15` | Maximum wait before inference |
| `OCR_MAX_UPLOAD_MB` | `15` | File size limit in MiB |
| `OCR_MAX_PIXELS` | `32000000` | Maximum decoded image area; accepts 24.7 MP phone captures |
| `OCR_ENABLE_URDU` | `true` | Optional recognition of old-card name crops |
| `OCR_CORS_ORIGINS` | HTTP localhost:3000 and 127.0.0.1:3000 | Comma-separated browser origins |
| `PADDLE_PDX_CACHE_HOME`, `HF_HOME` | Library defaults | Persistent model caches |
| `OCR_TEXT_DETECTION_MODEL_DIR` | Library download | Local medium detector |
| `OCR_TEXT_RECOGNITION_MODEL_DIR` | Library download | Local medium recognizer |
| `OCR_ORIENTATION_MODEL_DIR` | Library download | Local orientation classifier |
| `OCR_URDU_URL` | Unset | Local vision worker URL; no external hosts accepted |
| `OCR_URDU_KEY_FILE` | Required with worker | Private file containing worker API key |
| `OCR_URDU_BINARY`, `OCR_URDU_MODEL`, `OCR_URDU_MMPROJ` | Unset | Provisioned runtime/model paths used by the development launcher |
| `OCR_PORT` | `8000` | Local development backend port |

The Next.js proxy caps files at 15 MiB and upstream requests at 90 seconds. Keep
the backend size limit at or below that cap unless updating both sides.

## API behaviour

`POST /scan-cnic` and `POST /scan-dls` accept multipart `file`. `GET /` is a
lightweight service health response. Existing `success`, `text`, `results`,
`details` and `parsed` fields remain compatible with the frontend.

Successful responses also include:

- `quality.needsReview`, `missingFields`, `warnings` and `meanTextConfidence`.
  Text confidence is diagnostic, **not a probability of correct fields**.
  Operators must verify identity fields against the physical document.
- `quality.nameRecognition` gives old-card per-field outcome codes. Missing
  names have actionable warnings; unavailable recognition of both names is a
  retryable HTTP 503 rather than a successful blank-name scan.
- `timing.processingMs`, `preprocessingMs`, `inferenceMs`, `ocrPasses`,
  `orientationDegrees` and `queueMs`. Processing includes optional script
  recognition; inferenceMs measures the full-card OCR calls specifically.

HTTP 200 can contain partial data requiring review. Names preserve the source
script: Urdu stays Urdu and English stays English, without translation or
transliteration. Old-card names use at most two vision requests, one per row.
Low-confidence, incomplete or unavailable recognition leaves the field empty.
Operators must verify spelling against the card. Old-card name recognition requires a capture at least 1600
pixels wide; smaller captures return a retake/manual-entry warning rather than
guessing between similar Urdu names. Resolution alone does not guarantee focus.
Old-card issue and expiry dates stay empty, because those dates
are absent from the front. Small licence
authority text can contain spelling errors and is flagged for review. No identity
is recovered from a sample-specific ID/date lookup. Unknown names are not
replaced with mock identities in the check-in UI.

Empty/corrupt/unsupported images return 400; oversized uploads return 413;
blank, unreadable and wrong-document images return 422. Overload or an expired
queue wait returns 503 with `Retry-After`. Internal details stay in server logs;
clients receive a generic 500. Inference runs in a thread so health requests
remain responsive. Retakes are bounded to avoid uncontrolled retries.

The browser uses a lightweight preview and native sensor stills through
ImageCapture when supported, with bounded fallback to video capture. Card crops
retain up to 2600 pixels of native width. “Use phone camera” provides the phone's
own camera/file chooser; accepted JPEG/PNG/WebP files within 32 MP and 15 MiB
are passed through unchanged to avoid damaging fine Urdu strokes. Unsupported
or oversized photos are converted within those limits. Low-resolution hardware
is not upscaled. Camera streams stop during static review, on close and after
late camera permission resolution. Both forms use automatic text direction.
See the [Image Capture specification](https://www.w3.org/TR/image-capture/).

## Provision old-card name recognition

Using the backend's Python environment, provision public model/runtime files:

```powershell
python provision_urdu.py --destination C:/private/urdu-worker
```

Set the printed paths and `OCR_URDU_URL` in `backend/.env`, then use
`npm run dev:backend` from the repository root. It starts both the authenticated
vision worker and FastAPI and stops both on Ctrl+C. Production uses separate
systemd services. No image is uploaded to an external OCR provider. The worker
is CPU-only, uses pinned Qwen3-VL-2B GGUF weights and llama.cpp b12020, and needs
about 2 GB of additional working memory. Asset SHA-256 digests are verified.
The six-core VPS worker uses six vision threads after measured comparison;
the medium ONNX OCR keeps four threads. Development defaults are unchanged.
The unused Tesseract, TrOCR and larger-model experiments are not dependencies
of this backend.

## Tests

From `backend`:

```powershell
python -m unittest discover -s tests -v
python -m tests.run_acceptance --url http://127.0.0.1:8000 --repeat 3 --variants --output C:\private\ocr-acceptance.json
```

The first command checks validation, parsers, queue and HTTP control paths
without loading model weights. The second requires a running real OCR server;
it repeats six images three times, compares eight gold fields, checks rotated,
dark, compressed and blurred versions, rejects invalid uploads, and measures
health responsiveness during real concurrent scans. Reports contain sample
identity data: store them privately, outside version control.

The clear old-card test fixture is private and excluded from Git. Supply it at
`samples/old-cnic-pic.jpg` or use `--old-cnic C:\private\old-card.jpg`.
`tests.run_old_card_checks` additionally verifies independent printed names,
blank-name handling and old-card lighting/rotation/resizing. Those stress checks
separate exact recognition from safe manual-review handling.

The report separates exact field matches from safe review handling. Passing a
review requirement does not count a wrong/missing field as correct. The old Urdu
card's two absent dates can match empty gold fields; that is not evidence its
names were recognized. These repository fixtures are a regression set, not a
representative accuracy percentage for all Pakistani IDs. Benchmark on deployment
hardware and a consented, varied validation set before setting guarantees.
