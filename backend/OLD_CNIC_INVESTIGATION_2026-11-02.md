# Old-CNIC blank-name investigation — 2 November 2026

Historical v0.3.2 report. Source-script names, further camera fixes and current
measurements are in [the v0.3.3 report](NATIVE_OCR_RESULTS_2026-11-02.md).

## Reported issue and what was reproduced

The user reported both name fields blank, with the generic review banner, after
uploading the original sample to the public website. **That exact original-file
failure was not reproduced in this investigation.** Before changing production,
the existing live API read both names in three requests (10.17, 9.63 and 10.63 s).
Actual Operator and Admin browser uploads also populated both visible fields.
The private local and server-side source images have identical SHA-256 hashes.
This does not invalidate the user's failure; its exact trigger remains unknown.

The previous verification had covered HTTP/proxy responses, rather than the
complete browser form. This investigation adds real upload-to-visible-input
checks and saves screenshots and raw responses privately.

Two concrete defects were reproduced:

1. Camera capture always resized the card to 1000 pixels wide. Old-CNIC names
   require at least 1600 pixels of source detail, so this path skipped names.
   A tall `object-cover` preview also discarded landscape sensor pixels.
2. With the local name worker unreachable, the old API returned HTTP 200 and
   both names empty. The browser discarded the specific backend warning and
   displayed only a generic review banner. This recreates the reported visible
   condition under a controlled outage, but does **not** establish that an
   outage caused the user's original upload to fail.

## Changes

- Camera requests a higher-resolution stream, preserves the native crop up to
  2600 pixels and does not upscale a small capture. The preview uses contain
  rather than cover; guide coordinates account for letterbox margins.
- Old-card name outcomes have per-field status codes: read, inadequate source
  resolution, no readable row, low confidence, invalid reading, conversion
  failure, worker unavailable or time budget exhausted.
- Worker unavailability with both names absent returns HTTP 503 and
  `Retry-After: 2`. The browser stays on the retry screen instead of advancing
  to a successful blank form.
- Partial recognition still preserves supported fields, but the exact retake
  warning is shown. A missing full name no longer receives the green
  “Scan Complete” label. Failure logs contain status and dimensions, not names,
  CNIC numbers, image contents or model output.
- Confidence validation, the minimum-detail guard and English-only name output
  are retained. No names are guessed from an ID or substituted with defaults.
  Old-card issue/expiry dates remain empty.

## Verification

34 local unit/control checks and TypeScript checking passed. The isolated VPS
candidate passed the same 34 checks and all 49 API regression checks, including
three strict original old-card name checks and Smart-CNIC/licence regressions.
Those old-card HTTP times were 10.89, 8.98 and 9.99 s. Passing the regression
suite includes declared partial/manual-review cases; it is not perfect field
accuracy on every image.

The original sample was uploaded through the candidate's real Operator form
three times after restoring the worker. Both English name inputs matched the
real API response on all three runs. A real unreachable-worker test returned
503 through the frontend proxy, preserved `Retry-After`, showed a service error
and did not advance to the review form. A 1200-pixel upload showed the actual
retake reason and the missing-name label, with both names empty.

The actual camera component was tested with simulated browser video streams:

| Video source | Viewport | Captured card |
|---|---|---|
| 2160×3840 portrait | Mobile | 1829×1153 |
| 3840×2160 landscape | Desktop | 2600×1639 |
| 640×480 | Mobile | 533×336; no fake upscaling |

These validate camera geometry/output resolution, not physical-camera OCR
accuracy. Hardware can negotiate a lower resolution; inadequate captures still
require a better original image or manual entry.

An independently started cold vision worker read the original names correctly.
Restarting a service is therefore not presented as the root-cause fix.

Raw private reports/screenshots are outside Git under `cost-study/old-cnic-1102`
on the PC and `/opt/gateshield/backups/20261102-oldcnic-investigation` on the VPS.
No test completes a visitor registration or changes an existing user's password.
Temporary verification accounts are removed after testing.

## Public deployment verification

Live release: `/opt/gateshield/releases/20261102-oldcnic-v032-01`, OCR 0.3.2.
The candidate was kept private and traffic switched only after its checks.
Thirteen application/auth/OCR checks passed at each of the candidate, permanent
service and public-HTTPS stages, including real Smart-CNIC and licence scans.

The deployed public website was then tested through the actual browser form:

| Flow | Both visible English fields correct | Backend processing, three uploads |
|---|---|---|
| Android-emulated mobile Operator | 3/3 | 9.27, 11.32, 9.44 s |
| Desktop Admin | 3/3 | 11.70, 9.90, 9.16 s |

These are software-browser tests with the original source file, not a test of
the user's physical phone/gallery. Screenshots and JSON response/input pairs
were saved. A browser pass does not establish the trigger of the earlier user
failure, nor guarantee recognition of a compressed/different image.

The controlled outage changed only an isolated backend's local worker URL to
an unused loopback port. The production vision worker stayed running throughout.
The previous backend returned 200 with both names blank; the patched backend
and browser proxy returned 503 with `Retry-After: 2` and a visible retry screen.

After removing both temporary UI accounts, original database counts remained
four users, one person and one visit. All three permanent services were enabled,
healthy and had zero automatic restarts. Candidate/test ports were stopped.
Database/configuration backups and a tested configuration-validation procedure
are retained; rollback restores the prior release without restoring the database.

The exact original-upload trigger remains unconfirmed. A fresh user retest can
now distinguish inadequate detail, unreadable text and worker failure rather
than showing only the same generic banner for each condition.
