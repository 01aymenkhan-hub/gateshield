# Frontend update — 2026-11-03

Live: https://gateshield.pro

Integrated upstream commits `8441bbc` and `7c41bc98826350aeaad94161a558a8cf3431ce04`
from https://github.com/01aymenkhan-hub/gateshield, using the previously deployed
upstream baseline `9f18d26`. Nineteen changed frontend/theme files were merged
against the production fixes, rather than replacing the whole application.

Changes include the admin profile menu, employee/operator request shortcuts and
shared request counts, direct VIP invite modal, brand palette `#354F96`, and
self-hosted Jameel Noori Nastaleeq Urdu font. Email-template colour changes were
included; deployment tests did not send email or submit VIP invitations.

Browser testing caught a saved-English hydration mismatch: server rendering
started in Urdu while the browser's initial state came directly from local
storage. Language state now matches the server for hydration and restores the
saved preference afterwards. CSS imports were also placed before generated
Tailwind rules.

## Verification

* Local TypeScript, whitespace and camera capture regression checks passed.
* Production webpack build passed after the hydration fix.
* Nine frontend browser checks passed on the private candidate and public HTTPS:
  new palette/actions, both request shortcuts, VIP open/edit/cancel, profile
  settings navigation, theme toggle, mobile Urdu font/no page overflow,
  saved-language reload, and absence of browser runtime errors.
* Thirteen application/auth/API checks passed on candidate and public HTTPS,
  including real Smart CNIC, driving-licence and old-CNIC scans, anonymous
  access rejection and disabled-account rejection.
* Actual mobile operator and desktop admin forms were checked on both candidate
  and live: old-CNIC English names and original Urdu were present and the
  English spelling remained editable. No visitor record was submitted.
* Ten protected OCR API/camera/form files matched the previous release exactly.
  All nine backend Python source files retained their hashes. Both OCR service
  process IDs/start times remained identical: no OCR restart, model change,
  environment change or database migration was performed.

One public API regression run measured Smart CNIC at 1.927 s, newer licence at
1.850 s and old CNIC at 13.517 s of backend processing. The two live old-CNIC
form checks measured 8.650 s and 7.197 s. These are individual observations,
not a new speed guarantee or evidence that old-card recognition changed.
Existing old-CNIC review/accuracy limitations remain applicable.

## Deployment and recovery

Web release: `/opt/gateshield/releases/20261103-frontend-02`.
OCR remains in `/opt/gateshield/releases/20261103-urdu-english-v034-01/backend`.
The web service reuses the previous release's existing secret EnvironmentFile;
no additional environment-file copies were created.

The tested candidate served as a temporary Nginx bridge during the permanent
web switch. Previous hashed static assets were retained for open browser tabs.
SSL, hostname routing, signup restriction and OCR authentication were preserved.
Temporary test accounts/audit entries were removed and the staging service was
stopped. Existing records remained four users, one person, one visit and zero
parcels.

Private checksums, test evidence, prior web/Nginx configuration and rollback
script are at `/opt/gateshield/backups/20261103-frontend-update2/` on the VPS.
Rollback restores the previous web service and routing; it does not alter the
database or working OCR services.
