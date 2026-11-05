# Contabo VPS deployment

Target: `https://gateshield.pro`, Ubuntu 24.04, PostgreSQL 16, Nginx and systemd.
The VPS IP remains `217.216.78.153`; its existing HTTPS entry is retained.
Web release: `/opt/gateshield/releases/20261103-frontend-01`.
OCR remains 0.3.3 in `/opt/gateshield/releases/20261102-native-ocr-v033-01/backend`.
The original checkout remains at `/opt/gateshield/app` for rollback. Updating
that old checkout alone does not update the active release.

## Operations

### Domain and HTTPS (3 November 2026)

Namecheap DNS: apex A record `217.216.78.153`; `www` CNAME `gateshield.pro`.
The domain site is `/etc/nginx/sites-available/gateshield-domain`, enabled by
its matching symlink. HTTP redirects to HTTPS; HTTPS `www` redirects to the apex
while retaining the path/query. Both names use the certificate lineage
`/etc/letsencrypt/live/gateshield.pro/`, initially expiring 1 February 2027.
The enabled `gateshield-cert-renew.timer` renews all certificate lineages twice
daily and reloads Nginx after renewal. Keep port 80's ACME challenge route open.
The domain's simulated renewal and deploy-hook test passed after setup.

Production `APP_BASE_URL` is `https://gateshield.pro`; the web service was restarted
to load it. OCR/database configuration and application code were not changed.
Sessions from the IP address do not transfer to a different hostname; sign in
again on the domain. Pre-change Nginx/environment backups, private verification
results and the domain rollback script are in
`/opt/gateshield/backups/20261103-domain/`. Domain rollback does not restore or
change database records.

Thirteen real auth/application/OCR checks passed through the domain, including
secure HttpOnly cookies, Smart CNIC, driving licence and old Urdu CNIC. Normal
PC HTTPS access and HTTP redirection also passed. Temporary test accounts were
removed after verification.

Run these commands over SSH on the VPS, not on your Windows PC:

```bash
systemctl status gateshield-web gateshield-ocr gateshield-urdu --no-pager
systemctl restart gateshield-ocr
systemctl restart gateshield-web
journalctl -u gateshield-web -n 50 --no-pager
journalctl -u gateshield-ocr -n 50 --no-pager
journalctl -u gateshield-urdu -n 50 --no-pager
```

The services run as the unprivileged `gateshield` user, bind to localhost,
restart after failures, and have memory limits and read-only system protection.
Only Nginx exposes the website over HTTPS. The existing IP certificate and its
renewal timer are retained. Do not expose ports 3000, 8000, 8010 or 5432 publicly.

## Environment and database

The 3 November frontend import adds delivery in/out documents, vehicle lookup,
parcel sender details and private disk image storage. New images persist in
`/opt/gateshield/shared/uploads`; the web unit grants write access there. Existing
base64 image records retain their read fallback. An additive SQL upgrade is in
`scripts/upgrade-delivery-storage.sql`; it does not reset or remove records.
The optional upstream base64 migration script was imported but was not run.
Daily backups now include a matching verified uploads archive alongside each
database dump. Preserve both when restoring filesystem image references.
Frontend upgrade backups/rollback and private evidence are in
`/opt/gateshield/backups/20261103-ui-upgrade/`.
The previous web release remains on disk. See
`backend/OCR_COMPARISON_2026-11-03.md` for the other OCR's hardcoded sample behavior
and measured speed; that backend was not substituted for the current OCR.

Production Next.js settings are in the release's `.env`; OCR settings are in
the unchanged OCR release's `backend/.env`. They contain production configuration and must stay on the VPS.
Windows development environment files were excluded from the upload. Existing
database credentials, JWT secret, accounts and production data are retained.
This deployment does not run schema-reset, seed or data-loss commands.

The web service uses port 3000, OCR 8000, and PostgreSQL 5432. The root `.env`
points Prisma at the existing `gateshield` database. Local development's
`gatekeeper_local` database and port 55432 are unrelated to production.

OCR proxy requests require an approved, active admin/operator session.
Nginx limits scan requests to 30/minute per source IP with burst 10 and returns
429 when exceeded. Shared office IPs share this limit. OCR uploads are bounded
by Nginx, the Next.js proxy and the Python backend; queue overload returns 503.
The existing public signup restriction is preserved.

Old-card name recognition runs in `gateshield-urdu` on authenticated loopback
port 8010. Its pinned runtime/models, private API key and license notices are
under `/opt/gateshield/urdu-worker`; do not commit the key. The service has a
3 GiB memory limit and normally uses about 1.6 GB. The OCR service has a 4 GiB
limit, the web service 2 GiB. These are limits, not reserved memory. No identity
image is sent to an external model API. The Next.js OCR timeout is 90 seconds;
Nginx's scan timeout is 120 seconds. Shared model processing can affect latency.

## Backups and rollback

Pre-upgrade database, source and service/Nginx configuration snapshots:

```text
/opt/gateshield/backups/20261102-oldcnic-investigation/
```

To restore the previous v0.3.1 code and service configuration:

```bash
/opt/gateshield/backups/20261102-oldcnic-investigation/rollback.sh
```

Rollback keeps the live database intact, because this release changes no schema.
This rollback retains the previous release's dependency security patches.
Do not restore the pre-upgrade database over newer business records unless a
separate data recovery is actually required.

Daily PostgreSQL backups run at approximately 02:15 UTC, with up to 15 minutes
of randomized delay. The timer catches up after downtime. Backups are private,
verified custom-format dumps, retained locally for seven days:

```bash
systemctl list-timers gateshield-db-backup.timer gateshield-cert-renew.timer
systemctl start gateshield-db-backup.service
journalctl -u gateshield-db-backup.service -n 10 --no-pager
```

Files are under `/opt/gateshield/backups/daily`. These are on the same VPS;
off-server disaster recovery still needs a separate backup destination.

## Dependency security

Next.js and its ESLint configuration are pinned to 16.4.3. Targeted overrides
pin patched `deepmerge-ts`, `sharp` and `source-map-js` without migrating Prisma
to a new major version. Re-run Prisma generation, the production build, API
checks and dependency audit whenever changing these overrides.

The original runtime audit reported one critical and five high findings. The
patched lockfile runtime audit reported zero. This is a dependency audit result,
not a guarantee that the whole application has no security vulnerabilities.
The relevant advisories include [Next.js](https://github.com/advisories/GHSA-673q-mjm6-r5xr),
[deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) and
[sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

No production password is stored in this document. Rotate the root SSH password
shared in chat and configure an SSH key for future administration. The deployed
application itself runs without root privileges.

## Current v0.3.3 native-script OCR

Names preserve the card's source script. Urdu is no longer converted to English.
The authenticated local vision worker uses six threads; ONNX OCR remains at four.
Native sensor capture, an OS-camera option and camera stream cleanup are included.
See `backend/NATIVE_OCR_RESULTS_2026-11-02.md` for measured results and limitations.
Backup and rollback: `/opt/gateshield/backups/20261102-native-ocr/rollback.sh`.
It restores the previous three service units and Nginx config without changing
the database. The previous v0.3.2 release remains available on disk.

## Historical v0.3.2 investigation and verification

The original-file blank-name failure reported on 2 November was not reproduced
in direct API calls or actual browser uploads before changes. Its exact trigger
remains unconfirmed. Reproduced defects were the camera's fixed 1000-pixel output
and successful empty-name responses when the local name worker was unreachable.
The camera now preserves native detail and the worker failure returns a
retryable 503. Actual partial-recognition warnings are displayed in the form.
Failure logs record dimensions and reason codes, without identity text/images.

34 unit checks, 49 candidate API checks, real Operator upload-to-input repeats,
controlled worker-outage UI handling, low-resolution warnings and simulated
camera-geometry checks passed. See `backend/OLD_CNIC_INVESTIGATION_2026-11-02.md`
for methods, evidence and remaining limits. This is not a claim that every old
Urdu card will be fully recognized.

## Earlier v0.3.1 verification

33 backend unit/control checks, 49 real API acceptance checks and seven
additional old-card stress checks passed on the isolated VPS candidate. Old-card
names are returned in English letters; both names matched the clear source in
three candidate scans and three subsequent public HTTPS scans. Low-resolution
old cards now ask for a closer capture/manual names instead of guessing.
Old-card front-side issue/expiry dates remain empty. Identification marks and
some difficult names still need operator review; these checks are not a claim
of complete recognition for all documents.

Thirteen application/auth/OCR checks passed on the candidate, permanent services
and each of three public HTTPS runs. Old-card processing on public HTTPS was
10.97, 14.87 and 13.13 seconds; these are processing times, excluding network
transfer. Smart CNIC/newer driving-licence recognition remains intact.
Detailed methods and exact-versus-review results are in
`backend/OLD_CNIC_RESULTS.md`. Private raw evidence is kept in the backup folder.

## Earlier v0.3.0 deployment results

All 22 backend unit/control tests and 49 real API acceptance checks passed on
the VPS. Acceptance includes mandatory review handling and is not a claim that
all 49 scans had perfect field accuracy. Twelve application/auth/OCR checks
passed at each of three stages: candidate, permanent services and public HTTPS.
Temporary verification accounts and their audit records were removed.

Three uncached scans per original fixture measured these median times:

| Document | Original VPS code | Updated VPS code | Exact fields on clean sample |
|---|---|---|---|
| Smart CNIC | 15.23 s | 2.33 s | 8/8 |
| Newer driving licence | 13.71 s | 2.40 s | 8/8 |
| Older driving licence | 15.45 s | 2.42 s | 7/8; authority needs review |
| Old Urdu CNIC | 15.39 s | 3.16 s | 5/8, including two empty dates; names/mark need review |

These measurements use this VPS and repository fixtures. They are not a latency
SLA or a population-wide accuracy estimate. Recognition limitations are detailed
in `backend/OCR_IMPROVEMENTS.md`.

Public HTTPS and HTTP-to-HTTPS redirection passed from both the VPS and the
Windows PC. Nginx signup protection returned 403, anonymous/disabled-account
OCR requests returned 401, and an isolated loopback burst verified rate limiting
with 429 responses. The patched image optimizer returned a PNG successfully.
Existing counts remained four users, one person and one visit; no verification
accounts remained. Production web/OCR services had zero automatic restarts
after cutover, and temporary candidate ports/services were removed.
