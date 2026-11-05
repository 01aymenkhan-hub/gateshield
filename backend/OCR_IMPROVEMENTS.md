# OCR improvement verification — 31 October 2026

This is the earlier v0.3.0 benchmark. The subsequent old-CNIC English-name fix,
its different name-recognition runtime and current limitations are documented in
[OLD_CNIC_RESULTS.md](OLD_CNIC_RESULTS.md).

Changes are implemented locally. This is an OCR regression and performance report, not a claim that the whole application is production ready.

## Measured speed

Hardware: Intel Core i5-3570, four physical CPU cores, Windows, no GPU. Same PP-OCRv6 medium FP32 detector/recognizer; ONNX Runtime with four threads replaces the default Paddle CPU execution. Orientation correction is included in final timings.

Each row compares three real scans before and after. Baseline is the original handler at commit `8ee3799`, after model loading. Final measurements use local HTTP multipart requests, including preprocessing, inference and response transfer. No result cache/deduplication is used. Other desktop work can affect latency. These are local results, not an AWS latency commitment.

| Fixture | Before: 3 runs (s) | After: 3 runs (s) | Median before → after | Speedup | Exact gold fields after |
|---|---|---|---|---|---|
| smart_cnic.jpg | 16.44, 16.29, 19.10 | 5.92, 6.57, 7.39 | 16.44 → 6.57 s | 2.50× | 8/8, 8/8, 8/8 |
| dls_newer.jpg | 14.84, 15.21, 15.64 | 6.25, 6.24, 4.48 | 15.21 → 6.24 s | 2.44× | 8/8, 8/8, 8/8 |
| dls_older.jpg | 16.03, 16.11, 16.56 | 7.39, 6.36, 4.39 | 16.11 → 6.36 s | 2.53× | 7/8, 7/8, 7/8 |
| old_cnic.jpg | 11.97, 12.00, 12.04 | 11.23, 10.24, 6.57 | 12.00 → 10.24 s | 1.17× | 5/8, 5/8, 5/8 |

Clean smart CNIC and newer driving licence retain 8/8 field matches on all three runs. The additional CNIC-front fixture and synthetic card also match 8/8 in all three repeats. The CNIC-front fixture represents the same identity as the smart fixture; these are not six independent people.

## Accuracy limitations

- Older driving licence: 7/8 fields. Tiny licensing-authority text has a spelling/omission error and is flagged for operator review. The old parser hardcoded an officer surname correction and appended a city; those transformations were removed rather than counted as recognition.
- Old Urdu CNIC: 5/8 gold fields, including two correctly empty issue/expiry dates. The genuinely recovered nonempty fields are the identity number, DOB and gender. Name, father name and identification mark remain missing and need manual verification. The original code filled a known sample identity using its ID, DOB or OCR noise. That shortcut is removed. Its earlier apparent accuracy was not a valid baseline.
- Optional Arabic-script recognition retries detected name crops, but it does not reliably read the included old Urdu CNIC. More varied, consented Urdu-card data and a separately validated recognizer/fine-tuning are needed before claiming this limitation solved.
- A review flag is a conservative safeguard, not proof that every field error will be detected. Mean OCR confidence is not field accuracy.

## Tests completed

- **22/22 unit and HTTP control-path tests**: calendar validity, identity formatting, no sample-identity lookup, licence-title rejection, EXIF orientation, corrupt/blank/oversized files, streamed body limits, queue overflow/timeout/cancellation and generic internal errors. Model startup is mocked only in these control-path tests.
- **49/49 real API acceptance/report records** meet their specified exact-field, rejection or mandatory-review requirements: 18 original-image runs, 12 upload/error cases, two wrong-document cases, one back-side case, 15 image variants and one concurrency scenario. The concurrency scenario sends two actual inference requests. Review-handled field mismatches remain explicitly reported; this is not 49 perfect OCR results.
- **14/14 Postman assertions** through the real Next.js proxy: CNIC success/identity/quality/timing and all eight newer licence fields. No mock OCR responses or external result publishing.
- A separate real 17 MiB chunked multipart upload returned **413**.
- TypeScript `tsc --noEmit` passed. Targeted OCR route/helper/service ESLint: zero errors, two existing unused mock-argument warnings. Git whitespace checks pass.
- The original local production build was blocked by `/access` using `useSearchParams()` without Suspense. This was subsequently resolved during the Contabo deployment by preserving the server's existing Suspense fix; the patched Next.js 16.4.3 production build now passes. See `../DEPLOYMENT.md` for current deployment details.

Health response while two real scans ran: **8.4 ms**. Those requests took 7.15 s (0 ms waiting), 14.10 s (7144 ms waiting). Inference is intentionally serialized on this CPU; queued users can wait longer than single-scan timings.

## Variant results

Each variant is independently scanned through the real API. A field mismatch counts as a mismatch even if review handling passes.

| Image variant | Exact gold matches | Review required |
|---|---|---|
| samples/smart_cnic.jpg:rotate90 | 8/8 | No |
| samples/smart_cnic.jpg:rotate180 | 8/8 | No |
| samples/smart_cnic.jpg:dark | 8/8 | No |
| samples/smart_cnic.jpg:jpeg50 | 8/8 | No |
| samples/smart_cnic.jpg:mild-blur | 8/8 | No |
| samples/dls_newer.jpg:rotate90 | 8/8 | No |
| samples/dls_newer.jpg:rotate180 | 8/8 | No |
| samples/dls_newer.jpg:dark | 7/8 | Yes |
| samples/dls_newer.jpg:jpeg50 | 6/8 | Yes |
| samples/dls_newer.jpg:mild-blur | 8/8 | Yes |
| samples/dls_older.jpg:rotate90 | 7/8 | Yes |
| samples/dls_older.jpg:rotate180 | 7/8 | Yes |
| samples/dls_older.jpg:dark | 6/8 | Yes |
| samples/dls_older.jpg:jpeg50 | 7/8 | Yes |
| samples/dls_older.jpg:mild-blur | 6/8 | Yes |

## Implementation

- Explicit medium models and ONNX Runtime; no smaller model substituted just to improve timing.
- Four-way document orientation, EXIF handling, bounded retries and in-memory decoding.
- Real calendar validation; removal of fabricated sample identities and automatic admin mock fallback.
- Single inference owner with bounded waiting, responsive async HTTP handling, upload/pixel limits and clear 400/413/422/503 responses.
- Frontend proxy preserves errors; check-in shows a bilingual review warning for uncertain/partial scans.
- Backend setup, environment settings and repeatable test commands are documented in `README.md`.

Run the acceptance command from `backend/README.md` with a private output path. Raw reports include sample identity data; only aggregate metrics and field counts are recorded here. Before production, run a larger consented dataset across card layouts, cameras, lighting, Urdu/English text and deployment hardware.
