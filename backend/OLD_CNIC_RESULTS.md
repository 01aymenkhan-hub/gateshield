# Old CNIC English-name fix — 31 October 2026

Historical report: source-script names replace English conversion in v0.3.3.
See [the current report](NATIVE_OCR_RESULTS_2026-11-02.md).

This is the historical v0.3.1 report. The subsequent live blank-name complaint,
the reproduced camera/failure-handling defects and their limits are documented
in [the 2 November investigation](OLD_CNIC_INVESTIGATION_2026-11-02.md).

The old Urdu CNIC uses a separate local name-row recognizer. The application
returns personal names in English letters only, using usual English spellings.
Urdu recognition stays internal. No identity is inferred from a CNIC number,
date of birth, sample lookup or fixed default name. Old-card front-side issue
and expiry dates remain empty.

## Why the previous scanner failed

The English full-card recognizer could not reliably read Nastaliq name rows.
Arabic mobile recognition was also unreliable on this card. Some OCR noise
could enter the smart-card parser and be mistaken for English names. The new
flow identifies the old-card layout, clears those noise-derived names and reads
only detected name rows with a private, authenticated localhost vision worker.
The large phone sample also needed the decoded pixel limit raised to 32 MP.

## Implementation and limits

- PP-OCRv6 medium FP32 remains responsible for full-card OCR and driving licences.
- Pinned Qwen3-VL-2B Q4 with a Q8 vision projector runs locally via llama.cpp;
  no image is sent to an external OCR service. Downloads are SHA-256 verified.
- Recognition is constrained to the actual name/father-name row. Output must
  pass script, format, completion and confidence checks before English spelling.
- A smaller resized test produced a confident but wrong name. That candidate
  was held back. Captures below 1600 pixels wide now request a closer photo or
  manual names instead of attempting that unreliable recognition. Upscaling
  does not restore lost letter strokes. Resolution alone cannot guarantee focus.
- Missing, incomplete, low-confidence or unavailable names stay empty and are
  marked for review. The operator must verify spelling: Urdu alone does not
  establish a unique official English spelling. A review flag is not proof that
  every possible name error is detected.
- The source sample's identification mark remains unrecognized. It requires
  manual review. Older driving-licence authority text also retains its previously
  reported limitation.

## Local verification

33 unit/control checks passed, including rejection of external OCR hosts,
blank/digit/date rows, low-confidence output and inadequate native resolution.
TypeScript checking and launcher syntax checking passed.

49 real API acceptance checks passed. This includes strict recognition of both
English names on the clear private old-card photo in three independent scans,
unchanged clean Smart CNIC/newer-licence fields, invalid uploads, back-side
rejection, rotation/lighting/compression variants and concurrent health checks.
Acceptance also includes explicit manual-review outcomes; it does not mean all
49 scans had all fields correct.

| Original fixture | Local HTTP times, three runs | Exact fields |
|---|---|---|
| Old CNIC, clear photo | 21.14, 20.45, 19.84 s | 7/8 each; both English names correct, absent dates empty, mark missing |
| Smart CNIC | 4.78, 5.70, 5.09 s | 8/8 each |
| Newer driving licence | 4.30, 4.14, 5.13 s | 8/8 each |
| Older driving licence | 5.20, 4.45, 4.99 s | 7/8 each; authority text needs review |

Measurements use real uncached HTTP requests on this Windows i5-3570 CPU;
model loading is excluded. They are not an SLA or a population accuracy score.
The eight old-card comparison fields include two intentionally empty dates:
7/8 is not eight independently recognized text fields.

Private reports and synthetic independent-name fixtures are kept outside Git.
The supplied identity photo is excluded from source archives. Independent-name
stress tests distinguish exact names from safe empty/manual-review responses.
More consented old cards are needed to establish broader accuracy.

All seven additional local stress checks passed the no-wrong-name/manual-review
criterion. Four matched both expected fields exactly (including one intentionally
blank-name case); three needed a missing field completed manually. The resized
1200-pixel card returned both names empty with a retake warning. Synthetic cards
change names while retaining the same ID to check that names are read from
pixels rather than recovered from a stored identity.

## VPS and live HTTPS verification

Deployed release: `/opt/gateshield/releases/20261031-oldcnic-v031-02`.
The prior release, database dump and service configuration were retained for
rollback. No database migration/reset or account-password change was needed.

On the isolated VPS candidate, all 33 unit checks, 49 API acceptance checks and
seven additional old-card stress checks passed. Both English names matched on
all three original-photo scans: **10.38, 19.59 and 13.69 seconds HTTP latency**.
Only two of the seven stress cases matched both expected fields exactly
(including one intentionally blank field); five required manual completion.
All seven avoided a wrong nonempty name in this test set. This deliberately
separates successful safe handling from complete recognition.

Thirteen application/auth/OCR checks passed on the candidate, on the permanent
services and in each of three public HTTPS repetitions. These use real login
and real uploaded images through the frontend proxy, verify English names and
empty dates, check Smart CNIC/driving licence and deny anonymous/disabled users.
Temporary verification accounts and their audit records were removed.

| Public HTTPS scan | Run 1 processing | Run 2 processing | Run 3 processing |
|---|---|---|---|
| Old CNIC; both English names correct | 10.97 s | 14.87 s | 13.13 s |
| Smart CNIC | 2.84 s | 3.13 s | 2.48 s |
| Newer driving licence | 2.50 s | 3.06 s | 1.94 s |

These public timings are the backend's reported processing time, excluding
network upload and proxy overhead. CPU virtualization/load causes variation.
The old-card scan now performs additional name recognition; the earlier fast
partial response without names is not an equivalent accuracy/speed comparison.
The public site and certificate also returned HTTP 200 from the Windows PC.
The worker adds roughly 1.6 GB resident memory on this VPS. All three permanent
services are enabled at boot, run as `gateshield`, and had zero automatic
restarts at verification. Candidate services were stopped after cutover.

Private server-side evidence is in
`/opt/gateshield/backups/20261031-oldcnic-v031-02/`, readable only by root.
