# Medix — Vercel production deployment

This project is configured for TanStack Start on Vercel through Nitro.

## 1. Before pushing to GitHub

Run:

```powershell
npm install
npm run typecheck
npm run lint
npm run build
npm run db:check
```

`npm install` is important for this deployment package because it refreshes the lockfile to the patched TanStack Start release required after CVE-2026-102989.
Commit both `package.json` and `package-lock.json`.

## 2. Production database

Use your Neon PostgreSQL connection string as `DATABASE_URL`. Apply migrations from your trusted local machine before the first production deployment:

```powershell
npm run db:migrate
```

Do **not** run `npm run db:seed` against production.

## 3. Cloudflare R2

Create a private R2 bucket and an API token with object read/write access to that bucket. Do not enable public bucket access for medical documents.

Set:

```text
STORAGE_DRIVER=r2
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET=<bucket-name>
R2_ACCESS_KEY_ID=<R2 access key id>
R2_SECRET_ACCESS_KEY=<R2 secret access key>
```

Local development remains compatible with:

```text
STORAGE_DRIVER=local
MEDICAL_UPLOAD_DIR=./private-uploads
```

## 4. Vercel environment variables

Required for production:

```text
DATABASE_URL
SESSION_SECRET
APP_URL
STORAGE_DRIVER=r2
R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

Recommended/feature-dependent:

```text
AUTH_SESSION_MAX_AGE_DAYS=7
MAIL_FROM
MAIL_PROVIDER
MEDICAL_UPLOAD_MAX_MB=10
REALTIME_HEARTBEAT_MS
REALTIME_SESSION_RECHECK_MS
```

After the first Vercel deployment, set `APP_URL` to the final `https://...vercel.app` (or custom-domain) URL and redeploy.

Never prefix server secrets with `VITE_`.

## 5. Vercel project settings

Import the GitHub repository into Vercel. `vercel.json` explicitly selects `tanstack-start`; Nitro generates the Vercel-compatible output. Normally no custom Output Directory or custom server command is needed.

## 6. Realtime note

Phase 11 SSE remains enabled. Its in-memory broker is single-instance/best-effort; database persistence and client revalidation/polling remain the correctness fallback. A distributed broker (Redis/managed realtime) is still recommended before horizontal scaling.

## 7. Production smoke test

After deployment verify: public home page, login/logout, patient dashboard, booking, doctor dashboard/status transition, hospital/admin RBAC, medical record/prescription pages, R2 document upload + download, messaging, notifications, `/api/health`, and `/api/ready`.
