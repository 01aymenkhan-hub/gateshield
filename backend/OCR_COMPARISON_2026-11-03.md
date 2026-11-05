# Other developer OCR comparison and frontend import — 3 November 2026

Compared repository: `01aymenkhan-hub/gateshield`, commit `9f18d26`.
The separate clone and private raw evidence are outside this working checkout.

## Why its sample names look correct

In that revision, `backend/app/parser.py:882` selects a sample identity when
**any** of these conditions hold: the sample CNIC number, the sample DOB, or two
particular OCR noise strings. It then assigns fixed English name and father-name
strings. It does not recognize the name pixels in this branch. The DOB condition
can select that identity for a different person born on the same date.

A parser-only counterexample supplied a blank canvas and ID boxes, with no name
pixels. The fixed names were still returned. A different ID plus the sample DOB
also returned them. Actual inference on three modified-name/blank-name images
likewise returned the same sample names. Those results are not correct recognition
of the changed identities. This shortcut was not imported into production.

The general branch selects OCR boxes by position and maps known Urdu tokens to
Latin spellings. Its OCR engine initializes with `lang="en"`; it does not add an
Urdu name recognition model. The dictionary alone cannot supply unread Urdu
letters or guarantee official English spelling for unseen names. The default
identification mark is also "Nothing" when no mark was recognized.

## Measured speed and limits

On the existing VPS, the unmodified native Paddle runtime failed with a oneDNN
`ConvertPirAttribute2RuntimeAttribute` error before completing an image. An
isolated comparison copy was rerun with `enable_mkldnn=False`; no production OCR
code/model was replaced. Its worker used the repository's default two CPU threads.
Model startup/warmup was excluded. Three uncached original-photo scans took
**11.8978, 11.9026 and 13.1779 seconds**, median **11.9026**. Changed-name and blank
cases took 11.9509, 11.3427 and 10.4004 seconds and still returned the fixed names.
These are direct processing measurements of the compatibility-adjusted pipeline,
not a measurement of that developer's separate deployed server or default pool
under concurrent load. They cannot establish general name accuracy.

The existing OCR remains version 0.3.3. Through the merged frontend candidate,
Smart CNIC and newer licence took 2.415 and 2.442 seconds in the application check;
the original old Urdu card took 9.171 seconds with both native-script names exact.
An additional mobile browser Smart scan took 2.371 seconds and populated the
correct English fields without calling the old-card model. These are sample
measurements, not a latency SLA or population accuracy claim. Current old-card
recognition still has the limitations described in `NATIVE_OCR_RESULTS_2026-11-02.md`.
Source-script output is retained; this repository supplied no validated general
English-name OCR improvement to deploy.

## Imported frontend functionality

The three newer upstream commits after the shared `8ee3799` baseline add:

- Delivery company/source entry, vehicle numbers and normalized vehicle lookup.
- Required incoming/outgoing delivery document capture and viewing on records.
- Full-frame document camera and separate portrait/document steps.
- Filesystem image storage with authenticated serving and legacy base64 fallback.
- Parcel sender name/phone, updated unexpected-parcel forms and tracker data.
- Updated loader glow, mobile layouts, Operator login presentation and fixed
  Urdu/English layout, plus related employee/VIP/visitor screen adjustments.

All changed frontend routes/components and their schema/storage dependencies
were merged. Existing OCR proxy authentication, partial-result warnings,
automatic name text direction and improved CNIC camera were retained. Patched
Next.js 16.4.3 and dependency overrides were retained rather than downgraded.
One content conflict combined the upstream layout with the existing missing-name
warning. Original local copies are retained in private pre-merge backups.

## Validation and operations

An isolated database copy was used for candidate write tests; candidate data was
not routed to public traffic. TypeScript, the production webpack build, and the
existing CNIC camera utility checks pass. Webpack plus explicit tracing excludes
avoids tracing the separate Python virtual environment through dynamic disk paths.
Build environment is loaded by systemd; passing Node's `--env-file` through Next's
webpack build worker was rejected and is not used for the production build.

Seventeen real workflow checks pass: delivery documents, exact image bytes,
vehicle lookup/checkout, standard visitor/image storage, parcel sender validation,
parcel receive/deliver transitions and anonymous file denial. Thirteen existing
auth/application/real-OCR checks pass on the candidate. Synthetic test records and
their image files are removed after each run. Mobile browser tests verify three
portrait and three document-camera retakes with zero live streams during review,
the delivery vehicle field, new parcel fields and Urdu layout without horizontal
overflow. Three Operator and one Admin old-card uploads populated both visible
Urdu fields correctly. Camera tests use simulated streams, not a physical phone.

The imported portrait/document camera also received a generation guard for late
permission results, stream cleanup during review and video reattachment on retake.
These changes preserve full-frame document capture while avoiding background
camera streams. No identity data is hardcoded into these tests' runtime code.

The additive SQL upgrade preserves existing rows and base64 images. New images
use `/opt/gateshield/shared/uploads`, writable by the hardened web service and
retained across releases. Verified daily backups now pair a PostgreSQL dump with
its uploads archive. Existing images are not destructively migrated. Backups and
rollback scripts are under `/opt/gateshield/backups/20261103-ui-upgrade/`.
Rollback restores the previous web/Nginx configuration while retaining database
additions and newly stored files. Final public verification is recorded there.

The frontend cutover succeeded. All 17 workflow checks passed on the isolated
candidate, production bridge and public domain. All 13 auth/application/OCR checks
passed on the candidate, production bridge, permanent service and public domain.
Public mobile browser checks also passed the delivery/parcel/language flows and
both old-card name inputs. A public Smart CNIC scan processed in 2.406 seconds.
OCR remains on the previous release; only the web service moved to the new one.
