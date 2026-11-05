# Local servers

The Next.js application owns database access through Prisma. The Python OCR
service does not use PostgreSQL and does not need the database password.

Private machine-specific settings are in root `.env` and `backend/.env`. Both
are ignored by Git. The example files contain placeholders only. Next.js and
Prisma load root `.env`; the backend launcher loads `backend/.env` using Node's
`--env-file` support (Node 20.6+). Restart the service after changing its file.

From the repository root, use separate PowerShell terminals:

```powershell
npm run dev:db
```

This starts the configured existing PostgreSQL cluster on localhost, then exits.
Data persists in `POSTGRES_DATA_PATH`. It does not initialize or reset a cluster.

```powershell
npm run dev:backend
```

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

App: http://127.0.0.1:3000. OCR docs: http://127.0.0.1:8000/docs.

Local database: `gatekeeper_local`, role `gatekeeper_app`, localhost port 55432.
It is separate from the earlier cost-study test database. The application role
has no cluster-superuser, create-database or create-role privileges. Its local
connections use password authentication.

On a fresh empty application database, initialize the current schema explicitly:

```powershell
npx prisma generate
npx prisma db push
npm run db:seed
```

Do not use reset or accept-data-loss flags against an existing database. This
repository currently has no Prisma migration history; production schema changes
need a reviewed migration workflow. `db:seed` creates only the configured local
admin and never overwrites an existing password. Login credentials are the
`ADMIN_EMAIL` and `ADMIN_PASSWORD` values in root `.env`. These seed settings do
not automatically change the password when edited; use the app's account flow.

Email is disabled locally (`EMAIL_ENABLED=false`). Set real SMTP details before
enabling it. No SMTP password has been invented. Never put database, JWT or SMTP
secrets into `NEXT_PUBLIC_` variables.
