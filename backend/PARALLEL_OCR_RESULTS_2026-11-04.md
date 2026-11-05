# Fast old-CNIC mode and three parallel OCR workers

Live on https://gateshield.pro, 2026-11-04. OCR backend version **0.4.0**.

Old Urdu CNICs now use the normal detector/recognizer for the identity number,
DOB and other readable core details. Full Name and Father / Husband Name are
left blank for guard entry. No Urdu vision model, name transliteration, cloud
OCR or identity lookup runs in this path. Front-side issue/expiry dates stay
blank. A missing valid old-CNIC number returns 422 and asks for a retake.

## Actual production performance

The existing VPS has 6 vCPU and about 12 GB RAM. The deployed configuration is
**three independent OCR processes, two ONNX CPU threads per process**. Each
process owns its own predictors; three requests can run at the same time.
There is one API coordinator with three admission slots, a bounded additional
queue of four and a 15-second queue-wait timeout. Requests beyond three active
scans can still wait; this change does not promise unlimited concurrency.

| Original fixture | Single-request median, 3 runs | Parallel-request median, 12 runs per type |
|---|---:|---:|
| Smart CNIC | 3.813 s | 3.961 s |
| Newer driving licence | 3.109 s | 3.563 s |
| Old Urdu CNIC, names manual | 3.313 s | 3.051 s |

These are measured HTTP wall times on the VPS, including uploading original
fixture bytes to the loopback API. There is no image/result cache or fake
recognition. Token-level name conversion is no longer part of old-card timing.

* **Mixed simultaneous batch:** Smart CNIC + licence + old CNIC all finished in
  3.845, 3.927 and 3.776 seconds across three repeats.
* **Three old CNICs together:** all three finished in 3.058, 3.025 and 3.367
  seconds across three repeats, with exact expected CNIC numbers.
* All **12/12 production batches** used three distinct worker process IDs.
  Inference intervals overlapped in every batch; minimum three-way overlap was
  2.780 seconds. This verifies actual parallel processing, not only concurrent
  HTTP acceptance. Maximum measured admission wait in these batches was 0.88 ms.
* The slowest individual request across those batches was **6.245 seconds**
  (Smart CNIC). The median table is not a maximum or latency guarantee.
* Through the actual authenticated public HTTPS frontend, three mixed batches
  also passed. Each batch completed in **3.861, 3.771 and 4.007 seconds**, and
  all three backend inference intervals overlapped with distinct workers.
* Live mobile-operator and desktop-admin old-CNIC scans took **2.684 s and
  2.907 s** of backend processing. Both showed the exact CNIC number, empty
  names, and editable Full Name/Father Name fields. Tests typed both names but
  did not submit a visitor record.

The previous old-card path measured roughly 9–15 seconds while attempting Urdu
name recognition. The new path trades automatic Urdu names for manual entry.
The selected two-thread setting also trades some single-scan Smart CNIC/licence
speed for better three-scan throughput. Previously quoted 2–3 second single
scan timings should not be treated as a three-request concurrency guarantee.

## CPU-thread comparison

All configurations below retained three isolated workers. One and four threads
were compared with two sequential/mixed rounds; the two-thread configuration
also received the larger three-repeat benchmark.

| Threads per worker | Sequential median across types | Mixed parallel median across types |
|---|---:|---:|
| 1 | 5.342 s | 5.414 s |
| 2, candidate benchmark | about 3.3 s | about 3.5–3.9 s by type |
| 4 | 2.267 s | 4.973 s |

Two threads per worker were selected for the requested simultaneous workload.
Shared VPS CPU scheduling and real image content can change these observations.
The benchmark is a small bounded spike test, not an endurance/capacity SLA.

## Accuracy and control-path checks

* **48 unit tests** passed, covering manual names, exact identifier preservation,
  missing-number retake, three admission slots, timeout/overload handling,
  cancellation accounting, and invalid-image handling. A disconnected process
  request retains its admission slot until the process finishes.
* **49 candidate acceptance checks** passed: original fixture repeats,
  Smart CNIC/licence image variations, malformed/empty/oversized uploads,
  document-type checks and health responsiveness. A review pass does not mean
  every small licence-authority field was exact; the older licence still needs
  authority review as before.
* **50 candidate benchmark scans** passed, including 12 three-request batches.
* **50 production benchmark scans** passed, including 12 three-request batches
  and five old-card image variants. **20/20 old-card scans in that benchmark
  returned the expected CNIC number.** Names were blank by design.
* **7/7 additional old-card cases** passed identifier/manual-mode checks:
  synthetic changed-name/blank-name fixtures plus resized, rotated and darker
  versions. A 180-degree/re-encoded image needed a second OCR pass and took
  around 4–5 seconds; removing name inference does not eliminate image retries.
* **13 application/auth checks** passed on both candidate and public HTTPS.
* **9 public simultaneous OCR requests** passed across three mixed batches.
* Both admin and mobile operator browser flows passed on candidate and public
  HTTPS, including guard entry into both blank name fields.

The old-card evidence contains one real original CNIC plus generated/quality
variants. Repeated exact-number checks establish this fixture's behavior, not
population-wide number accuracy. Poor focus, glare or another layout may still
need a retake; operators should verify scanned numbers against the card.
Blank expected name/date fields are not counted as text recognized by OCR.

## Implementation and deployment

`app/workers.py` holds persistent process-local model instances; startup waits
for all three processes to initialize. `app/main.py` owns the bounded admission
gate and dispatches one job per available slot. Worker start/end timestamps
and process IDs in response timing provide overlap evidence. Predictors are
not shared between inference threads. Runtime dependencies are unchanged.

Architecture references: Python
[ProcessPoolExecutor](https://docs.python.org/3/library/concurrent.futures.html#processpoolexecutor)
and ONNX Runtime [thread management](https://onnxruntime.ai/docs/performance/tune-performance/threading.html).
CPU settings were selected from this VPS's measurements, not a documentation
performance promise.

OCR release: `/opt/gateshield/releases/20261104-fast-ocr-v040/backend`.
The existing frontend release, SSL/domain and PostgreSQL database remain in
place. The unused Urdu model service is stopped and disabled. Legacy research
model assets are retained privately but not loaded by the fast scan pipeline.
The local launcher also starts only the normal API; `backend/.env.example`
shows the three-worker/two-thread configuration.

Private benchmark evidence and scoped rollback are in
`/opt/gateshield/backups/20261104-parallel-ocr/` on the VPS. Actual identity
images and detailed responses remain on the VPS. All temporary verification
accounts are removed after checks; no visits or VIP messages are submitted.
No database migration or business-record deletion is part of deployment.
