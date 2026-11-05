# Smart CNIC and driving licence speed verification — 3 November 2026

The previous response's 7–10-second figures described old Urdu CNIC tests.
They were not measurements of Smart CNIC or driving licences. This check
investigated the user's concern about a regression on those faster documents.
No runtime code or production configuration was changed during this check.

Target: active v0.3.3 deployment at https://217.216.78.153. The original
`smart_cnic.jpg` and `dls_newer.jpg` fixtures were each submitted three times
directly to FastAPI and three times through authenticated public HTTPS.
All requests performed real inference; no cached result or mock was used.

| Path/document | Three HTTP elapsed times (seconds) | Median |
|---|---|---|
| Direct backend / Smart CNIC | 2.1088, 2.0847, 1.9119 | 2.0847 |
| Direct backend / newer licence | 1.7094, 1.8557, 1.8583 | 1.8557 |
| Public HTTPS / Smart CNIC | 1.9797, 2.0208, 1.9314 | 1.9797 |
| Public HTTPS / newer licence | 1.7514, 2.0894, 1.7167 | 1.7514 |

All 12 requests returned 200 and all eight expected fields matched for each
document. Every request used one full-card OCR pass and reported
`nameRecognitionMs: 0`: the old-CNIC vision model did not run. Queue waits were
0.05–0.07 ms. Production services were healthy with zero automatic restarts.
The temporary authenticated test account and its audit records were removed.

Both HTTP clients ran on the VPS. Public checks traverse HTTPS, Nginx, application
authentication and the OCR proxy, but do not measure the user's phone-to-VPS
upload, camera preparation or visible UI duration. These clean-fixture results
do not reproduce a 7–10-second Smart CNIC/licence scan. They cannot rule out
slower fresh images, retries, contention or mobile transfer. Those causes remain
unconfirmed for the user's device. Old-card recognition remains slower and can
require review; it must be reported separately from these document types.

Private raw evidence and the temporary test runner are retained at
`/opt/gateshield/backups/20261103-speed-check/` on the VPS; credentials are not
stored in these reports. The earlier 15.23→2.33s and 13.71→2.40s figures remain
historical sample measurements, rather than guarantees for every capture.
