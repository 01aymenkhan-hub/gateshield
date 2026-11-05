# GateShield deployment verification — 5 November 2026

Target: https://gateshield.pro. Application release:
`/opt/gateshield/releases/20261105-auth-01`, source commit `f12e2cf`.
Upstream reviewed and integrated: `0e64534`.

The update adds password visibility controls, admin-approved password recovery,
and role-specific registration/reset request management. Only the primary web
installation was upgraded. Both OCR services retain version 0.4.0 and one
worker each. Their source hashes and process IDs were identical before and
after deployment; neither OCR service was restarted.

## Fixes established through tests

Journeys were derived from the incoming feature and its authorization rules;
there was no supplied plan document. ECC TDD and verification workflows were used.

| Evidence | RED | GREEN / fix |
|---|---|---|
| Duplicate reset requests cannot take ownership of an approved reset | Three executed failures, checkpoint `eb2820f`: tracker takeover, tracker rotation, exact ticket expiry | `429bf77`: preserve the owner's tracker, issue unrelated dummy trackers to other browsers, enforce exact expiry |
| Password changes revoke recent sessions | Executed regression failure in `76fb60e`: a session issued one second earlier remained valid | `0395c1e`: remove the two-second grace period and include millisecond issuance timestamps in new staff/employee sessions |
| Approval authorization survives a database round trip | Real candidate HTTP tests failed completion; approval time returned from PostgreSQL was one hour ahead of the original timestamp | Candidate DB sessions changed from Europe/Berlin to UTC; all 28 checks then passed. Additive migration in `f12e2cf` provisions UTC sessions and reset storage |

The incoming frontend also needed initial polling/highlight timers scheduled
with cleanup to pass lint on the new recovery components (`6247002`).

## Validation actually executed

| Check | Result |
|---|---|
| `node --test scripts/tests/password-reset.test.cjs` | 12 passed; mocked request dependencies plus actual crypto/auth functions |
| Targeted Node V8 coverage | Request route 98.85% lines; reset helper 95.31%; combined 97.03% lines, 75.31% branches, 93.33% functions |
| `python -m unittest tests.test_validation tests.test_old_cnic tests.test_transliteration` | 48 passed; synthetic/control-path tests, not a substitute for real card scans |
| `npx tsc --noEmit` | Passed |
| Production `npm run build` on VPS | Passed, Next.js 16.4.3; isolated candidate DB and release |
| Targeted ESLint for recovery routes, reset helper and new recovery components | Passed |
| Candidate HTTP + PostgreSQL reset integration | 28 checks passed |
| Post-deployment HTTP + PostgreSQL reset integration | Same 28 checks passed against primary application at loopback port 3000 |
| Candidate visitor/delivery/parcel integration | 17 checks passed |
| Post-deployment public HTTPS visitor/delivery/parcel integration | Same 17 checks passed against gateshield.pro |
| Browser, candidate and public HTTPS | Password visibility toggles preserve the value; recovery form opens; no page errors |
| Candidate OCR through authenticated Next.js proxy | 9 real scans passed: smart CNIC, driving licence and old CNIC, three repeats each |
| Public HTTPS OCR after deployment | Same 9 scans and expected field comparisons passed; anonymous scans rejected |
| Other installation | HTTPS login 200; web/OCR services active; OCR reports one worker |

Reset integration covers all three role logins, anonymous/role restrictions,
pending/approved/rejected/expired requests, admin management views, tracker
ownership, confirmation validation, simultaneous completion, replay rejection,
old-password/session rejection, new-password login, generic unknown-account
responses and rate limiting. Requests and accounts are synthetic and cleaned up.
Email was disabled in both candidate and production during these checks.

## OCR observations

Measured from the VPS through the public HTTPS application endpoint; phone
camera capture and the user's mobile upload connection are not included.
Each tested scan used one OCR pass. These are three repeats per saved fixture,
not a claim about every card or all future server loads.

| Fixture | Median | Range |
|---|---:|---:|
| Smart CNIC | 3.378 s | 3.345–3.978 s |
| Driving licence | 3.251 s | 2.754–3.540 s |
| Old CNIC | 3.131 s | 2.532–5.790 s |

Old CNIC names remain manual as requested. Its CNIC number and expected core
fields passed all three comparisons. The 5.790 s old-card observation occurred
inside processing, not queue wait; it is retained in the results rather than
discarded. This frontend release makes no OCR speed improvement claim.

## Deployment and data preservation

- Database/attachment backup completed successfully before migration.
- `scripts/upgrade-password-reset-storage.sql` was tested on the isolated DB
  before primary deployment. It adds the reset enum, table, indexes and nullable
  `users.passwordChangedAt`; it does not delete existing records.
- Primary database connection timezone changed from Europe/Berlin to UTC to
  prevent timestamp-dependent reset failures. Existing stored timestamps were
  not rewritten. The second company's DB configuration was not changed.
- Existing production environment file remains in use. No secrets or private
  real-card fixtures were included in source archives or Git.
- Prior static chunks were retained for already-open browser sessions.
- Business counts before and after synthetic cleanup: 4 users, 1 person,
  1 visit, 0 parcels.
- Evidence and previous web unit are private on the VPS under
  `/opt/gateshield/backups/20261105-auth-upgrade`.

Rollback: restore `web-unit-before.service` from that directory to
`/etc/systemd/system/gateshield-web.service`, daemon-reload and restart only
`gateshield-web`. The additive schema can remain for compatibility; restoring
the old application does not require deleting the new table or restoring the DB.

## Known verification limits

The broader changed-frontend ESLint run is not clean: 45 errors and 11 warnings,
predominantly existing explicit-any and effect-state findings (42 errors in
the prior baseline). The new recovery routes/components targeted above are
clean. Whole-project lint and coverage are not represented as passing; coverage
numbers apply only to the two specified password-reset modules, with branch
coverage below 80%. Existing upstream features were reviewed/tested after their
implementation; only fixes made in this task have genuine RED/GREEN evidence.

Target acceptance: VERIFIED for the listed production workflows and fixture
scans. This is a bounded regression run, not an endurance or arbitrary-image
accuracy certification.
