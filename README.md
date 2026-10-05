# Medix — Healthcare & Doctor Appointment Platform

Medix is a full-stack healthcare web application: patients find verified doctors and hospitals, book
appointments, and manage records, prescriptions, documents, messages and payments; doctors, hospital
administrators and platform administrators each have their own portal.

> **Status:** feature-complete through Phase 13 (auth, RBAC, booking, doctor/hospital/admin portals, medical
> records, prescriptions, documents, messaging + notifications, realtime SSE, billing, public provider
> directory with reviews and favorites). Phase 14 made the project **reproducibly testable and CI-ready**
> (see [Testing, CI & Production Readiness](#testing-ci--production-readiness)).

## Technology Stack

- **[React 19](https://react.dev/)** + **[TanStack Start](https://tanstack.com/start)** (SSR, server functions) + **TanStack Router/Query**
- **[Drizzle ORM](https://orm.drizzle.team/)** + **PostgreSQL** — the source of truth for all application data
- **TypeScript**, **Tailwind CSS 4**, **Radix UI / shadcn/ui**, **Vite**
- **npm** is the only supported package manager (no Bun, pnpm or yarn)
- Tests: **node:test** via `tsx` (unit + PostgreSQL integration) and **Playwright (Python)** for browser E2E

## Prerequisites

- **Node.js 20.6+** (22 recommended) and npm
- **PostgreSQL 14+** reachable from your machine (local install, Docker, or hosted)
- Only for browser E2E: **Python 3.9+** (see [Testing](#end-to-end-browser-tests))

## Quick start (fresh clone)

```sh
git clone <this-repository-url>
cd <project-folder>
npm install
cp .env.example .env          # then edit .env (see "Environment variables")
npm run db:migrate            # create the schema from the migrations
npm run db:seed               # OPTIONAL: fictional development data
npm run dev                   # http://localhost:3000
```

**Windows (PowerShell)** — identical except for copying the file and one-off environment variables:

```powershell
git clone <this-repository-url>
cd <project-folder>
npm install
Copy-Item .env.example .env   # then edit .env
npm run db:migrate
npm run db:seed
npm run dev
```

The commands work from any folder (`D:\Medix hospital website`, `/home/me/projects/medix`, …): nothing in the
project or its tests depends on an absolute path. Notes for Windows:

- `npm run …` scripts run through `cmd.exe`, so the `&&` chains in `package.json` work in PowerShell too.
- Setting an environment variable for **one command**: PowerShell `$env:NAME="value"; npm run x` ·
  cmd `set NAME=value && npm run x` · bash `NAME=value npm run x`.
- Create a database with `createdb medix` (psql tools on PATH), pgAdmin, or `psql -U postgres -c "CREATE DATABASE medix"`.
- Line endings: `.gitattributes` forces LF and `.prettierrc` uses `endOfLine: auto`, so a Windows checkout with
  `core.autocrlf=true` does not make `npm run lint` fail.

## Environment variables

Copy `.env.example` → `.env` (git-ignored). `.env.test.example` → `.env.test` configures the test tooling.
**Never commit either file.** The client bundle never contains server variables (verified by a bundle scan, see
[Security notes](#security-notes)).

### Application

| Variable                                               | Dev                                                   | Production                        | Purpose                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                                         | required                                              | **required**                      | PostgreSQL connection string (`postgres://USER:PASSWORD@HOST:PORT/DB`)  |
| `SESSION_SECRET`                                       | optional (insecure default + warning)                 | **required, ≥ 32 chars**          | Hashes/signs session tokens. `openssl rand -base64 32`                  |
| `APP_URL`                                              | optional                                              | **required**                      | Public URL; used to build password-reset links                          |
| `AUTH_SESSION_MAX_AGE_DAYS`                            | optional                                              | optional                          | Session lifetime (default 7)                                            |
| `MAIL_PROVIDER`, `MAIL_FROM`                           | optional (mail is printed to the console, never sent) | provider required for email flows | Outbound email                                                          |
| `MEDICAL_UPLOAD_DIR`, `MEDICAL_UPLOAD_MAX_MB`          | optional (`./private-uploads`)                        | recommended (persistent volume)   | Private medical-document storage, kept outside the web root             |
| `REALTIME_HEARTBEAT_MS`, `REALTIME_SESSION_RECHECK_MS` | optional                                              | optional                          | SSE tuning (defaults 25 s / 30 s)                                       |
| `MEDIX_LOG_SQL_PARAMS`                                 | optional (`1`)                                        | **ignored**                       | Include SQL parameter values in logged DB errors — local debugging only |
| `SEED_PASSWORD`, `MEDIX_ALLOW_REMOTE_SEED`             | optional                                              | n/a (seed refuses production)     | Dev seed password override / explicit opt-in to seed a non-local DB     |

In **production** (`NODE_ENV=production`) the server validates its configuration at boot (`src/lib/env.server.ts`)
and refuses to start with a clear, value-free message if `DATABASE_URL`, `SESSION_SECRET` (≥ 32 chars) or `APP_URL`
is missing/invalid. Missing `MAIL_PROVIDER` / `MEDICAL_UPLOAD_DIR` only produce warnings.

### Test tooling (`.env.test` or real environment variables)

| Variable                                                                                                                                  | Required                          | Purpose                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `TEST_DATABASE_URL`                                                                                                                       | **yes** (no default)              | A **disposable** database whose name contains the word `test`, e.g. `postgres://USER:PASSWORD@localhost:5432/medix_test` |
| `TEST_BASE_URL`                                                                                                                           | no (`http://127.0.0.1:4173`)      | Where the E2E runner serves the app                                                                                      |
| `TEST_PASSWORD`                                                                                                                           | no (documented dev seed password) | Shared password of the seeded **fictional** accounts                                                                     |
| `TEST_PATIENT_EMAIL`, `TEST_DOCTOR_EMAIL`, `TEST_PATIENT_B_EMAIL`, `TEST_DOCTOR_B_EMAIL`, `TEST_HOSPITAL_ADMIN_EMAIL`, `TEST_ADMIN_EMAIL` | no                                | Account emails (defaults = the seeded accounts)                                                                          |
| `TEST_ALLOW_REMOTE_DB`                                                                                                                    | no                                | `1` permits a non-local test host (name + sentinel rules still apply)                                                    |
| `TEST_PYTHON`                                                                                                                             | no                                | Python interpreter for E2E if `python3`/`python`/`py` is not the one you want                                            |

Tests **never read `DATABASE_URL`**; that variable belongs to your development database.

## npm scripts

| Script                                                         | What it does                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `preview`                            | Dev server · production build · serve the build                                                                                    |
| `npm run typecheck`                                            | `tsc` for the app **and** for `tests/` + `scripts/`                                                                                |
| `npm run lint` · `npm run format`                              | ESLint (incl. Prettier rules) · Prettier write                                                                                     |
| `npm run db:generate` · `db:migrate` · `db:seed` · `db:studio` | Drizzle Kit / seed (see [Database Setup](#database-setup))                                                                         |
| `npm run db:check`                                             | Migration integrity + schema-drift check (no database needed, mutates nothing)                                                     |
| `npm run test:unit`                                            | Fast tests with **no database** (guard rules, log redaction, validation, env/seed guards, migration verifier, realtime hub/client) |
| `npm run test:db:setup` · `test:db:reset`                      | Create/refresh (or drop + recreate) the disposable test database                                                                   |
| `npm run test:integration`                                     | PostgreSQL integration suites: billing, directory/reviews/favorites, log redaction                                                 |
| `npm run test:billing` · `test:directory` · `test:realtime`    | A single suite                                                                                                                     |
| `npm run test`                                                 | `test:unit` + `test:integration`                                                                                                   |
| `npm run test:e2e`                                             | Browser E2E with automatic DB reset, build, app start/stop                                                                         |
| `npm run test:ci`                                              | The full non-browser verification (see [CI](#continuous-integration))                                                              |

## Project Structure

```
├── .github/workflows/ci.yml    # CI: verify + e2e jobs
├── drizzle/                    # SQL migrations + snapshots + meta/_journal.json (source of truth)
├── public/                     # Static assets
├── scripts/test/               # Test tooling: central config, DB guard, DB setup, migration check, E2E runner
├── src/
│   ├── components/             # UI (auth, cards, common, directory, layout, public, ui/shadcn)
│   ├── data/mock/              # Static content that is NOT provider data (articles, dashboard widgets)
│   ├── db/                     # Drizzle schema, server-only client, seed (+ seed-guard), create-admin
│   ├── lib/                    # auth, appointments, billing, directory, reviews, favorites, realtime, validation, …
│   ├── routes/                 # File-based TanStack Router routes (incl. /api/health, /api/ready)
│   └── server.ts / start.ts    # SSR entry (production env validation) / TanStack Start instance
├── tests/
│   ├── unit/                   # No-database tests
│   ├── integration/            # PostgreSQL-backed tests (run behind the fail-closed guard)
│   ├── billing/ directory/ realtime/   # Domain suites
│   ├── support/                # preload.ts (guard) + E2E fixtures
│   └── e2e/                    # Playwright (Python) scripts, helpers, requirements.txt
├── .env.example / .env.test.example
├── drizzle.config.ts · vite.config.ts · tsconfig.json · tsconfig.tests.json
```

See `src/routes/README.md` for the file-based routing conventions.

## Database Setup

Medix uses **PostgreSQL** with **Drizzle ORM**. **Migrations are the single source of truth** for the schema.

```sh
npm run db:migrate     # apply drizzle/*.sql in journal order (creates tables, enums, constraints, indexes)
npm run db:seed        # optional fictional development data (idempotent)
npm run db:studio      # optional: Drizzle Studio GUI
```

Changing the schema: edit `src/db/schema/*`, run `npm run db:generate`, **review and commit** the generated SQL +
snapshot, then `npm run db:migrate`. `npm run db:check` fails if the schema and the migrations disagree.

> **Do not use `drizzle-kit push`** for normal development or any deployment. It bypasses the migration journal
> (a past `push` desynchronised `drizzle.__drizzle_migrations`; see "Migration Strategy & Audit" below). Always
> `generate` → commit → `migrate`.

**Seed safety** (`src/db/seed-guard.ts`): the seed creates accounts that share a documented password, so it
refuses to run when `NODE_ENV=production` **and** refuses any non-local database host unless you set
`MEDIX_ALLOW_REMOTE_SEED=true` deliberately. It is idempotent and uses fictional data only. The credentials it
prints are labelled development-only.

**Server-only access:** database code lives behind `@tanstack/react-start/server-only`, so the build fails if
client code ever imports it.

## Health & readiness endpoints

| Endpoint          | Meaning                                                                                   | Response                                                |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `GET /api/health` | **Liveness** — the process answers HTTP. Does not touch the database.                     | `200 {"status":"ok"}`                                   |
| `GET /api/ready`  | **Readiness** — valid production config **and** PostgreSQL answers `select 1` within 3 s. | `200 {"status":"ok"}` or `503 {"status":"unavailable"}` |

Both are `no-store` and return only a status flag — never connection strings, versions, hostnames or error text
(failure reasons are logged server-side, with SQL parameters redacted). Use `/api/health` for liveness probes and
`/api/ready` for readiness/load-balancer checks.

## Testing, CI & Production Readiness

### Test pyramid at a glance

| Layer               | Command                             | Needs                          | Covers                                                                                                                                                                   |
| ------------------- | ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration integrity | `npm run db:check`                  | nothing                        | journal ↔ files ↔ snapshots, timestamp order, schema drift                                                                                                               |
| Static              | `npm run typecheck`, `npm run lint` | nothing                        | app + tests + scripts                                                                                                                                                    |
| Unit                | `npm run test:unit`                 | nothing                        | test-DB guard, log redaction, validation schemas, env + seed guards, migration verifier, realtime hub/client                                                             |
| Integration         | `npm run test:integration`          | disposable PostgreSQL          | billing (fee snapshot, one invoice, payments, refunds, isolation), provider directory, reviews, favorites, moderation, real-error log redaction                          |
| Browser E2E         | `npm run test:e2e`                  | PostgreSQL + Python/Playwright | messaging/realtime, session security, disconnect/restart, route smoke, notifications, billing UI, directory, **end-to-end booking → review**, RBAC, cross-patient access |

### Test database safety (fail-closed)

Anything that creates, updates, suspends, books, reviews or messages runs **only** against a database that passes
**all** of these (`scripts/test/db-guard.ts`):

1. `TEST_DATABASE_URL` is set — tests never fall back to `DATABASE_URL`;
2. the database name contains the standalone word **`test`** (`medix_test`);
3. it is **not** the application database (`DATABASE_URL` / `.env`);
4. the host is local (or `TEST_ALLOW_REMOTE_DB=1`);
5. it contains the **sentinel table** `medix_test_sentinel`, written only by `npm run test:db:setup`.

(5) is the strong guarantee: a populated development/production database can never carry the sentinel, so even a
database misnamed `…_test` is refused. `test:db:setup` **adopts only a completely empty database** and
`test:db:reset` **drops only a database that carries the sentinel**. Refusals abort _before a single query runs_
(`tests/support/preload.ts` is loaded ahead of every DB-backed test and helper). Schema is created with the
project's real migrations — never `push`.

### Running the tests

```sh
cp .env.test.example .env.test        # set TEST_DATABASE_URL (a NEW database name containing "test")
npm run test:unit                      # no database
npm run test:db:setup                  # creates the DB if missing, migrates, seeds
npm run test:integration
```

PowerShell one-off: `$env:TEST_DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/medix_test"; npm run test:db:setup`.
The role in `TEST_DATABASE_URL` needs `CREATEDB` for the setup tool to create the database; otherwise create an
**empty** database yourself and the tool will adopt it.

### End-to-end browser tests

One-time setup:

```sh
python -m pip install -r tests/e2e/requirements.txt     # Windows alternative: py -3 -m pip install ...
python -m playwright install chromium
```

Then `npm run test:e2e`. The runner (`scripts/test/e2e-runner.ts`) does everything and always cleans up:

1. verifies Python + dependencies and that the test port is free (it will not talk to a server it didn't start);
2. runs the safety guard, resets the disposable DB, migrates, seeds and creates E2E fixtures;
3. builds the app, starts it on `TEST_BASE_URL` against the **test** database and waits for `/api/ready`;
4. runs each `tests/e2e/e*_*.py` script against a **pristine** database (restored from a template copy in ~1 s)
   with the server env that script declares in its `# E2E-SERVER-ENV:` header;
5. stops the server (killing the whole process tree on Windows) even on failure or Ctrl-C.

Flags: `--only e2_,e8_` (file-name prefixes; use `e1_` for messaging because `e1` also matches `e10`),
`--skip-build`, `--shared` (do not reset between scripts). Logs: `.test-run/server.log`; failure screenshots:
`.test-run/screenshots/`. Both are git-ignored. A full run takes several minutes; `--only` runs a subset.

### Continuous integration

`.github/workflows/ci.yml` (GitHub Actions, npm only, **no repository secrets**):

- **`verify`** (the gate): `npm ci` → `db:check` → `typecheck` → `lint` → `build` → `test:unit` → a **real
  `drizzle-kit migrate` + seed from an empty database, run twice** (idempotency) → `test:db:setup` →
  `test:integration`, against a `postgres:16` service container.
- **`e2e`** (separate job): Python + Playwright Chromium → `npm run test:e2e`; uploads the server log and
  screenshots on failure. It is its own job because it needs a browser download and is the slowest, most
  environment-sensitive part; a browser flake must not obscure the deterministic `verify` result.

The PostgreSQL password in the workflow belongs to a throwaway service container that exists only for the job; it is
not a secret and CI never needs (or sees) your production/Neon credentials. `npm run test:ci` runs the same
non-browser sequence locally.

### Logging policy

- Passwords, session tokens and reset tokens are never logged; the dev mail adapter only prints links outside
  production, and production without `MAIL_PROVIDER` fails loudly instead of logging links.
- **SQL parameters are redacted** from every logged error (`DrizzleQueryError` embeds bound values — message
  bodies, clinical text, e-mails, token hashes). The SQL text, error type and stack are kept. Verified against a
  real PostgreSQL error (`tests/integration/error-logging.test.ts`). `MEDIX_LOG_SQL_PARAMS=1` re-enables values
  for **local** debugging only and is ignored in production.
- Expected authorization failures are redirects/not-found responses and produce no log noise (a full E2E run
  including RBAC denials wrote three startup lines to the server log).

### Security notes

- **Dependency audit:** the only remaining `npm audit` findings are 4 _moderate_ advisories in the
  `drizzle-kit → @esbuild-kit/* → esbuild ≤ 0.24.2` chain: a dev-server request-forwarding issue in a **dev-only
  CLI tool** that this project never runs as a server. npm's only "fix" is a breaking _downgrade_ of `drizzle-kit`
  to 0.18, which is not taken. Re-check periodically; upgrade `drizzle-kit` when its dependency chain moves to a
  patched esbuild.
- The production bundle is scanned for credentials, DB drivers, password/session code and server-only modules
  (none present). Public pages receive explicit DTOs, never raw rows.

## Authentication

Medix has a real, production-oriented authentication system — not a demo.

### How it works

- **Passwords** are hashed with **Argon2id** (`@node-rs/argon2`, prebuilt
  native binding — no compiler toolchain needed). Plaintext passwords are
  never stored or logged, and password hashes never leave the server.
- **Sessions** are opaque, randomly-generated tokens stored in an `HttpOnly`,
  `SameSite=Lax` cookie (`Secure` in production). The cookie itself carries
  no data — the server looks up an HMAC-hashed version of the token in the
  `auth_sessions` table on every request. Sessions last
  `AUTH_SESSION_MAX_AGE_DAYS` (default 7 days) and are immediately
  invalidated on logout or password reset.
- **Roles** (`PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN`, `ADMIN`) always come from
  the database — never from anything the client sends. Dashboard routes
  under `/patient/*`, `/doctor/*`, `/hospital/*`, and `/admin/*` are
  protected by a `beforeLoad` guard (`src/lib/auth/route-guards.ts`):
  unauthenticated visitors are redirected to `/login`; authenticated users
  with the wrong role are redirected to `/unauthorized` (never silently
  dropped into someone else's dashboard).
- **Registration** is public only for `PATIENT`, `DOCTOR`, and
  `HOSPITAL_ADMIN`. Patients are `ACTIVE` immediately; doctor and
  hospital-admin accounts start `PENDING_VERIFICATION` and can sign in, but
  `requireVerifiedDoctor()` / `requireVerifiedHospital()` gate
  operations that assume a trusted, approved provider. **There is no public
  admin registration** — see below.
- **Password reset** uses a single-use, expiring (1 hour), HMAC-hashed token
  emailed as a link. The response to "forgot password" is always the same
  neutral message regardless of whether the email exists, to avoid account
  enumeration. A successful reset invalidates every existing session for
  that account.
- **Rate limiting** protects login, register, forgot-password, and
  reset-password. The current implementation is in-memory
  (`src/lib/auth/rate-limit.server.ts`) — correct for local development and
  a single server instance, but it does **not** coordinate across multiple
  instances/processes. Swap its internals for a shared store (e.g. Redis)
  before scaling horizontally; the `checkRateLimit()` function signature is
  designed to make that a drop-in change.
- **Audit logging**: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `REGISTER`,
  `PASSWORD_RESET_REQUESTED`, and `PASSWORD_RESET_COMPLETED` are recorded in
  the existing `audit_logs` table — never passwords, tokens, or session
  secrets.
- **CSRF**: server function mutations already run through the app's
  existing `createCsrfMiddleware` (`src/start.ts`), which validates the
  request's origin — confirmed blocking cross-origin requests in testing.
  Combined with `SameSite=Lax` cookies and the fact that all mutations are
  POST-only server functions (never GET), no additional CSRF token system
  was added.
- **Email delivery**: in development, "sent" email (e.g. password reset
  links) is printed to the server console instead of actually being sent.
  In production, sending fails loudly with a clear error unless a real
  provider is wired up in `src/lib/auth/mailer.server.ts` — it will never
  silently log a sensitive reset link to production output.

### Creating an admin account

There is no admin sign-up page. Create one from the command line:

```sh
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' npm run admin:create
```

If the env vars are omitted you'll be prompted interactively instead.

### Known limitation

Hospital-admin accounts aren't yet linked to a specific hospital record —
that association (and full hospital-admin verification workflow) is modeled
in a later phase. For now, a hospital-admin account is treated as
"verified" once a platform admin flips its `status` from
`PENDING_VERIFICATION` to `ACTIVE`.

## Appointment Booking

The patient appointment flow — `/book`, `/patient/appointments`, and the
appointment-related parts of `/patient/dashboard` — is backed by
PostgreSQL end to end, not mock data.

### Architecture

Server-side logic lives in `src/lib/appointments/`:

- `queries.server.ts` — read queries (bookable doctors, ownership-scoped
  patient appointments). A doctor is only "bookable" if their account is
  `ACTIVE`, their provider verification is `APPROVED`, and they've marked
  themselves available — enforced by one shared condition, not repeated
  ad hoc per query.
- `availability.server.ts` — generates real bookable time slots from a
  doctor's weekly `doctor_availability` rules (not permanently-stored future
  rows), excluding breaks, already-booked times, and anything in the past.
- `service.server.ts` — `bookAppointment()` and `cancelAppointment()`. Every
  fact about a booking (the doctor's fee, whether a hospital really belongs
  to that doctor, whether the slot really exists) is re-derived from the
  database here — nothing is trusted from the client.
- `functions.ts` — the `createServerFn` boundary patient-facing pages call.

### Timezone convention

Appointment dates/times are stored and reasoned about as plain local
"wall-clock" values (Postgres `date` + `time`, no UTC conversion anywhere in
the stack). This matches Medix's current single-timezone deployment. See the
comment in `src/lib/appointments/types.ts` for the reasoning and what to
change if Medix ever needs multiple timezones.

### Double-booking protection

Two patients can never successfully book the same doctor/date/time. This is
enforced by a **partial unique index** in Postgres itself:

```sql
CREATE UNIQUE INDEX appointments_doctor_slot_unique
  ON appointments (doctor_id, appointment_date, start_time)
  WHERE status <> 'CANCELLED';
```

Under concurrent requests for the same slot, every request passes the
application-level checks and attempts the same `INSERT` — Postgres allows
exactly one to succeed and rejects the rest with a unique-violation, which
`bookAppointment()` catches and turns into "This slot was just booked by
someone else." **Verified directly**: firing 5 simultaneous booking requests
for the same slot against a real database resulted in exactly 1 success and
4 clean rejections, every time. Cancelling an appointment (`status =
'CANCELLED'`) immediately frees the slot, since the index only applies to
non-cancelled rows — also verified by successfully rebooking a freed slot.

### Cancellation & status rules

Centralized in `src/lib/appointments/status.ts` (`isUpcomingAppointment`,
`canPatientCancelAppointment`) — the same functions gate the "Cancel" button
in the UI and the server-side check before a cancellation is written, so
they can never disagree. Patients can only ever move an appointment to
`CANCELLED`; `CONFIRMED`/`COMPLETED`/`NO_SHOW` are set by doctor/admin
workflows in a later phase.

### Payment status

No payment gateway is integrated in this phase. Every booking is created
with `paymentStatus: "PENDING"` and the UI says so explicitly — there is no
fake "payment successful" message anywhere.

### Current limitations

- `/doctors` and `/doctors/:id` (the public browse/detail pages) still
  display mock data — only the `/book` flow's own doctor selector reads
  real, bookable doctors from PostgreSQL. A doctor id arriving from
  anywhere (a URL, a stale page) is always re-validated server-side before
  it's trusted, so this is a content/UX gap, not a security one.
- Slot generation assumes the server's own clock is the applicable local
  time (no per-hospital timezone field yet).
- No reschedule flow, video-call integration, or doctor-side appointment
  management yet — those belong to later phases.

## Doctor Portal

`/doctor/dashboard`, `/doctor/appointments`, `/doctor/patients`,
`/doctor/availability`, and `/doctor/profile` are backed by PostgreSQL end
to end — not mock data or placeholders.

### Architecture

Server-side logic lives in `src/lib/doctor/`:

- `queries.server.ts` — `requireDoctorRecord()`/`requireVerifiedDoctorRecord()`
  resolve the authenticated session to the caller's own `doctors` row (never
  a client-supplied `doctorId`), plus dashboard stats, appointment/patient
  queries — all scoped to that doctor by construction.
- `appointments.server.ts` — the doctor-side status transition service.
- `availability.server.ts` — availability CRUD, reusing Phase 4's
  `isHospitalValidForDoctor` check.
- `profile.server.ts` — profile updates restricted to a fixed field allowlist.
- `functions.ts` — the `createServerFn` boundary the doctor pages call.

### Status transitions

A strict transition matrix (`src/lib/doctor/appointments.server.ts`) is the
only way an appointment's status changes on the doctor side:

| Action                   | Allowed from                                        | Result    |
| ------------------------ | --------------------------------------------------- | --------- |
| Confirm                  | PENDING                                             | CONFIRMED |
| Complete                 | CONFIRMED, **and** the appointment time has arrived | COMPLETED |
| No-show                  | CONFIRMED, **and** the appointment time has arrived | NO_SHOW   |
| Cancel (reason required) | PENDING or CONFIRMED                                | CANCELLED |

Anything not in this table is rejected — e.g. completing an appointment
before its scheduled time, or confirming something already CANCELLED.
**Verified directly**: attempting to complete a future appointment is
rejected with a clear message; the same appointment succeeds once its
scheduled time has passed. The update itself also re-checks the
previously-read status in its `WHERE` clause, so a concurrent change from
another tab can't be silently overwritten.

### Patient access model

A doctor can only see a patient if they share a real appointment — there is
no global patient directory. `getDoctorPatientDetail()` returns `null`
identically whether the patient doesn't exist or simply has no relationship
with this doctor, so nothing is disclosed either way. **Verified**: Doctor B
attempting to modify Doctor A's appointment is rejected with "Appointment
not found," and a `/doctor/patients/:id` page for an unrelated patient 404s.

### Availability management

The doctor availability UI reads and writes the exact same `doctor_availability`
rows Phase 4's patient-facing slot generator reads — there is no separate or
duplicated scheduling table. Deleting or disabling a rule can never delete
an existing appointment, since the two tables have no foreign-key
relationship; only future slot generation is affected. **Verified**:
creating a rule with a hospital not associated with the doctor is rejected;
disabling/deleting a rule leaves previously-booked appointments untouched.

### Profile management

Doctors can edit their name, biography, years of experience, profile image,
and consultation fee. Medical license number, verification status, and
rating are not editable through this form — they're set by Medix's
(not-yet-built) admin verification process. **Verified**: raising a
doctor's consultation fee updates future bookings' displayed fee while an
already-booked appointment keeps its original, historically-stored fee.

### Current limitations

- Doctor-initiated cancellation is implemented, but there's no
  patient-facing notification when a doctor cancels or reschedules yet.
- No admin verification UI exists yet — `verificationStatus` can currently
  only be changed by editing the database directly (see Phase 6).
- Overlapping availability rules for the same day/time aren't rejected at
  creation time; slot generation simply de-duplicates identical start
  times, which is safe but not identical to flagging the conflict up front.

## Admin Portal

`/admin/dashboard`, `/admin/users`, `/admin/doctors`, `/admin/hospitals`,
`/admin/appointments`, `/admin/doctor-verification`,
`/admin/hospital-verification`, and `/admin/activity-logs` are backed by
PostgreSQL. **After this phase, approving a provider no longer requires a
manual database update** — the Phase 5 limitation is closed.

### Creating an admin

There is still no public admin registration. Use the CLI:

```sh
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' npm run admin:create
```

### Provider verification

Every decision goes through one transition matrix
(`src/lib/admin/verification.server.ts`):

| Action                    | Allowed from | Result    |
| ------------------------- | ------------ | --------- |
| Approve                   | PENDING      | APPROVED  |
| Reject (reason required)  | PENDING      | REJECTED  |
| Suspend (reason required) | APPROVED     | SUSPENDED |
| Reactivate                | SUSPENDED    | APPROVED  |
| Reopen review             | REJECTED     | PENDING   |

Anything else is rejected — there is no generic "set status" endpoint.
**Verified**: approving from a suspended state, and rejecting from a
suspended state, are both refused with a clear message.

The status change and its permanent `provider_verification_events` row are
written **in one transaction**, so the system can never report a successful
approval while losing the audit trail.

Approval and suspension take effect immediately and automatically, because
the downstream checks read the same column: `listBookableDoctors()` requires
`APPROVED`, and `requireVerifiedDoctorRecord()` gates the Doctor Portal.
**Verified end to end**: a pending doctor is not bookable → admin approves →
doctor becomes bookable → admin suspends → doctor disappears from booking →
**existing appointments are untouched** (row count unchanged).

### User management

Users can be filtered by role, status, and email, with server-side
pagination. Suspension **deletes the target's sessions in the same
transaction**, so an already-signed-in user loses access immediately —
**verified**: a patient's live session returned `null` and their dashboard
redirected to `/login` moments after suspension, using their original cookie.

Account status and provider verification are kept deliberately separate:
reactivating a suspended account restores sign-in but does **not** silently
restore a doctor's `APPROVED` verification.

### Admin self-protection

An admin cannot suspend their own account, and the last remaining ACTIVE
admin cannot be suspended at all (that would lock everyone out). There is no
arbitrary role-editing endpoint. **Verified**: a self-suspension attempt is
refused.

### Hospital-admin relationship

The new `hospital_admins` junction table explicitly links HOSPITAL_ADMIN
users to the hospital(s) they may manage, supporting several admins per
hospital. `requireHospitalAdmin()` resolves this from the session, and
`requireHospitalAccess(hospitalId)` checks a supplied id against that list —
a browser-supplied hospital id is never trusted on its own. **Verified**: the
seeded hospital admin resolves to exactly one hospital and is denied on the
other two.

### Appointment oversight

`/admin/appointments` is deliberately **read-only**. Clinical outcomes are
recorded by the treating doctor, not an admin. Reason-for-visit and patient
notes are not selected by the query at all, so they can't leak into the
admin UI.

### Activity logs

`/admin/activity-logs` reads the real `audit_logs` table with action and
date-range filters and pagination. Audit metadata records _that_ a reason
was given (`hasReason: true`) rather than the reason text itself; the reason
lives on the provider record and in `provider_verification_events`.

### Known limitations

- Suspending a doctor does **not** automatically cancel their future
  appointments — by design, since silently cancelling patients' bookings is
  worse than flagging it. Those appointments remain and need an operational
  follow-up flow (a later phase).
- In-app notifications for verification decisions are not implemented.
- `/admin/users` has no detail page yet; the underlying admin-safe query
  (`getAdminUserDetail`) exists and is exposed, but no route consumes it.
- Hospital registration doesn't yet create the `hospital_admins` link
  automatically — the seed does it, and an admin currently has to create the
  link directly for new hospitals.

## Hospital Portal

`/hospital/dashboard`, `/hospital/profile`, `/hospital/doctors`,
`/hospital/appointments`, `/hospital/patients`, `/hospital/departments`,
`/hospital/services`, and `/hospital/schedules` are backed by PostgreSQL.

### Authorization

Every hospital operation resolves the authorized hospital from the session
through `hospital_admins` (`resolveHospitalContext()` in
`src/lib/hospital/queries.server.ts`). **No server function accepts a
`hospitalId` for ownership** — for multi-hospital admins, a preferred id is
still checked against the authorized list, so a forged value resolves to
"not authorized" rather than granting access.

Mutations additionally go through `requireOperationalHospital()`, which
requires the hospital's own verification to be `APPROVED`. A
pending/rejected/suspended hospital can still sign in and see a clear
blocked state, but cannot change anything — and **cannot verify itself**,
since `verificationStatus` is unreachable from the profile update path.

**Verified**: Hospital A's appointment is absent from Hospital B's list and
returns `null` on a direct fetch as Hospital B; Hospital B cannot toggle
Hospital A's department ("Department not found").

### Dashboard, appointments, patients

All counts are hospital-scoped (verified: Hospital A showed 4 appointments /
2 doctors / 1 patient while Hospital B showed 0 / 1 / 0 against the same
database). Appointments and patients are **read-only oversight** — confirming
and completing stays with the treating doctor, and reason-for-visit and
clinical notes are not selected by the list queries at all. The patient list
is derived purely from this hospital's own appointments; there is no global
patient directory.

### Doctor affiliations

Hospital admins may affiliate **already-verified** doctors — they cannot
change any doctor's global verification, which stays with platform admins.
**Verified**: affiliating a suspended doctor is refused, and a duplicate
affiliation is refused.

Removing an affiliation is blocked while the doctor still has upcoming
non-cancelled appointments at that hospital, rather than silently orphaning
patients' bookings. **Verified**: removal was refused with "This doctor
still has 2 upcoming appointment(s)…", and the appointment count was
unchanged (4 → 4). Removal only ever deletes the `hospital_doctors` join
row; doctors, patients, and appointment history are never touched.

### Departments & services

Hospital-scoped catalogs with create / edit / enable-disable. Items are
**disabled rather than deleted**, since other records may reference them.
Uniqueness is per hospital, so two hospitals can both have a "Cardiology".

### Schedules

A read-only view of the same `doctor_availability` rows the patient booking
flow and Doctor Portal use — there is no second scheduling system. Editing
hours stays with the doctor who owns them.

### Intentionally deferred

- `/hospital/staff` — a real staff model means identity and permissions for
  non-clinical users; building it properly is its own phase, so the route
  stays an honest "Coming soon" rather than fake records.
- `/hospital/rooms-beds` — bed management is a substantial operations
  domain and isn't modeled at all yet.
- `/hospital/analytics` — the dashboard shows real aggregates; a full
  analytics suite needs architecture this phase didn't build.
- **Administrative appointment cancellation** was deliberately not added.
  Cancellation already exists for patients and doctors, and adding a third
  actor without a defined operational policy would be a button without a
  workflow behind it.
- Hospital name changes do **not** currently trigger re-verification. The
  public URL slug is read-only for exactly this reason, but a full
  re-verification workflow for identity changes is future work.
- `hospitals.facilities` (free-text array) still powers the existing public
  hospital pages alongside the new relational `hospital_services`; they are
  not yet unified.

## Clinical Records & Prescriptions

Phase 8 adds the first real clinical workflow on top of the existing
appointment system: a doctor can create a medical record and a prescription
for a **completed** appointment, and the patient can securely view their own
history. This section documents the model, its guarantees, and its current
limitations honestly — **no claim of HIPAA, GDPR, or other healthcare
regulatory compliance is made here**; achieving that would require a formal
audit well beyond this phase.

### Authorization model

Every clinical read and write is centralized through
`src/lib/clinical/authorization.server.ts` and the ownership-scoped queries
in `src/lib/clinical/queries.server.ts`. The rules that hold everywhere:

- **Identity always comes from the session**, never from the browser. A
  doctor's id is resolved via `requireVerifiedDoctorRecord()` (active
  account, `APPROVED` verification status); a patient's id via
  `requireRole("PATIENT")`. `patientId`/`doctorId`/`hospitalId` are never
  accepted as client input for authority — they're derived server-side from
  the appointment itself.
- **Clinical creation requires an owned, `COMPLETED` appointment.** A doctor
  can only create a medical record or prescription against an appointment
  that exists, belongs to them, belongs to the relevant patient, and has
  status `COMPLETED`. `PENDING`/`CONFIRMED`/`CANCELLED`/`NO_SHOW`
  appointments are rejected.
- **Ownership checks are baked into the query itself**, not applied after
  the fact in React. A patient fetching another patient's record, or a
  doctor fetching another doctor's record, gets exactly the same "not
  found" response as a nonexistent id — nothing about the record's
  existence leaks.

### Medical records

- One primary `medical_records` row per appointment, enforced by a real
  **database unique index** on `appointment_id`
  (`medical_records_appointment_unique`) — not just a "check then insert" in
  application code, which can race under concurrent requests. Two
  simultaneous creation attempts for the same appointment both pass
  authorization; the database allows exactly one `INSERT` to succeed, and
  the resulting unique-violation is caught and turned into a clear
  `ClinicalError` rather than a duplicate or a 500.
- Only the doctor who created a record may edit it in this phase. Hospital
  admins and platform admins cannot edit or create medical records.
  Editing updates `updatedAt` and is audited, but **does not keep a
  revision history** — see Known limitations below.
- No hard delete. There's no "delete medical record" control anywhere in
  the UI (patient, doctor, hospital, or admin).

### Prescriptions

- A prescription is issued by the same authorized doctor against the same
  completed appointment, optionally linked to the medical record created
  for that visit (`completed appointment → medical record → prescription`).
- A prescription and all of its medication items are written in a single
  database transaction — a prescription can never end up with a header and
  zero items, or items pointing at a header that failed to commit.
- At least one medication item is required; every item is validated
  server-side (name length, etc.) and empty/nonsensical items are rejected.
- The system only stores what the doctor typed — **it does not recommend
  dosages, check drug interactions, or auto-prescribe anything.**
- Status is limited to what the existing `prescription_status` enum
  actually supports: `ACTIVE -> COMPLETED`. There's no `CANCELLED`/voided
  state in the schema yet, so none is implemented in the UI.

### Access by role

- **Patients** see only their own medical records and prescriptions
  (`patientId = session user`).
- **Doctors** see only medical records/prescriptions they personally
  authored — not a hospital-wide or platform-wide directory, and not
  another doctor's notes about the same patient. A doctor's patient-detail
  page (`/doctor/patients/:id`) shows only records they created for that
  patient. Broader care-team sharing is a future design decision, not
  assumed here.
- **Hospital admins** do not automatically get clinical access just because
  an appointment happened at their hospital. The hospital portal stays
  operational (schedules, appointment status, staff) — no diagnoses,
  notes, or prescriptions are exposed there.
- **Platform admins** do not get a routine clinical-content viewer either.
  Admin lists (users, appointments, verification) do not surface
  diagnoses, notes, or prescriptions.

### Audit logging

`audit_logs` gains new actions: `MEDICAL_RECORD_CREATED`,
`MEDICAL_RECORD_UPDATED`, `MEDICAL_RECORD_VIEWED`, `PRESCRIPTION_CREATED`,
`PRESCRIPTION_UPDATED`, `PRESCRIPTION_VIEWED`. Metadata is limited to safe
identifiers — actor user id, record/prescription id, appointment id — and
**never** clinical text (diagnosis, symptoms, notes, medication
instructions are never copied into `metadata`). Detail-page opens
(`getDoctorMedicalRecordFn`, `getMyMedicalRecordFn`, etc.) are audited as
`*_VIEWED` events; list views are not, to avoid generating a log line per
card render.

### Retention / delete policy

Medical records and prescriptions cannot be hard-deleted by patients,
doctors, hospital admins, or platform admins in this phase. A prescription
can move `ACTIVE -> COMPLETED`, which is the only status transition the
schema currently models. This is intentionally conservative rather than
fully compliant — see limitations below.

### Known limitations

- **No revision/amendment history.** Editing a medical record overwrites
  the previous text; `updatedAt` moves forward and the edit is audited, but
  the prior diagnosis/notes are not retained anywhere. A production system
  handling real clinical data would need an append-only amendment trail.
- **No prescription cancellation/voiding.** The `prescription_status` enum
  only has `ACTIVE`/`COMPLETED` today; a "cancelled" or "voided" state
  would need a schema change plus a documented reason field.
- **No lab reports, imaging, or file/document uploads** attach to a
  clinical record yet — `medical_documents` exists in the schema but Phase
  8 deliberately does not build UI for it.
- **No care-team sharing model.** A doctor only ever sees records they
  personally created; there's no concept yet of a second doctor at the same
  hospital needing read access to a colleague's notes for the same patient.
- **This is not a certified medical-records system.** No claim of HIPAA,
  GDPR, or other regulatory compliance is made — this phase focuses on
  correct authorization, ownership isolation, and safe auditing, which are
  necessary but not sufficient for that.

## Medical Documents

Phase 9 adds real file storage for lab reports, imaging results, discharge
summaries, referrals, and other clinical attachments — always as metadata
in Postgres plus bytes in a private storage backend, never as raw bytes in
the database itself. As with Clinical Records & Prescriptions, **no claim
of HIPAA, GDPR, or other regulatory compliance is made** — this section
documents what's actually built and what isn't.

### Storage architecture

`src/lib/storage/` is a small abstraction (`StorageDriver` in `types.ts`)
with one method set — `put`, `get`, `delete` — so the rest of the app never
talks to the filesystem (or, later, an object store) directly:

- `local.server.ts` — the only driver in this phase. Files live under
  `MEDICAL_UPLOAD_DIR` (default `./private-uploads`, outside the public web
  root and listed in `.gitignore`), written with random UUID keys and
  `0600` permissions.
- `storage.server.ts` — the single place that decides which driver is
  active. Swapping in an S3/R2-compatible driver later means writing one
  new class here; `src/lib/documents/service.server.ts` and everything
  above it stays untouched.

### Private-file policy

- Never stored in `/public`, static assets, or any publicly reachable
  directory.
- The original filename is **display metadata only** — it is never used to
  build a filesystem path. The storage key is a fresh random UUID,
  generated by the storage driver itself.
- `LocalStorageDriver.resolveSafePath` re-derives the path from a key and
  verifies the result is still inside the configured storage root before
  any filesystem call — this, not just sanitizing the input, is what
  actually stops path traversal. Verified directly in testing: a filename
  of `../../../../etc/passwd.pdf` is stored under an unrelated random key,
  and calling the driver with a traversal-shaped key is refused outright.
- There is no public URL or static route that serves these files. The only
  way to read the bytes back is the authenticated download function below.

### Upload security

- **Allowlist**: PDF, JPEG, PNG only (`ALLOWED_MIME_TYPES` in
  `file-validation.server.ts`).
- **Size limit**: `MEDICAL_UPLOAD_MAX_MB` (default 10MB), rejected before
  the file is ever written to storage.
- **Real file-signature (magic-byte) checks** — not just the extension or
  the browser's declared MIME type. A `%PDF-` header, a JPEG SOI marker, or
  the PNG signature bytes are what actually decide the stored MIME type;
  a text file renamed to `report.pdf` is rejected because its bytes don't
  match, regardless of what the browser claims.
- **SHA-256 checksum** computed and stored for every file, for integrity
  and duplicate-investigation purposes.
- **Atomic upload flow**: authorize → validate the file → store the bytes
  → write the DB row. If the DB write fails after the file is already
  stored, the orphaned file is deleted (`service.server.ts`'s catch
  block) — an upload never succeeds partially.
- **Malware scanning is explicitly NOT implemented.** The allowlist +
  size limit + magic-byte check + private storage are real, but they are
  not a substitute for a scanner. A production deployment should add one
  as a step between "file validated" and "file stored" in
  `service.server.ts`; the interface (`StorageDriver`) intentionally
  leaves room for that without a rewrite.

### Clinical authorization

Document upload reuses Phase 8's exact "owned, COMPLETED appointment" rule
(`requireCompletedOwnedAppointment`, re-exported from
`src/lib/documents/authorization.server.ts` rather than duplicated) —
patient, doctor, and hospital identity are always derived from the
doctor's own completed appointment, never accepted from the client.

- **Doctor access**: documents they personally uploaded, or documents tied
  to one of their own appointments — never a hospital-wide or
  platform-wide directory, and never another doctor's upload for an
  unrelated appointment.
- **Patient access**: only their own documents (`patientId = session
user`), enforced inside the query itself. A wrong/unowned id returns the
  same "not found" as a nonexistent one.
- **Hospital admins** do not get clinical document bytes just because the
  appointment happened at their hospital — the hospital portal stays
  operational, not clinical.
- **Platform admins** do not get a "download every patient's files"
  feature. Admin lists don't surface document content.

### Doctor document workflow

- `/doctor/reports` — documents the doctor is authorized to see.
- `/doctor/reports/new?appointmentId=…` — upload form (document type,
  title, description, file); reachable from a completed appointment's
  detail page and from a medical record's detail page (pre-fills the
  linked record so the chain `appointment → record → document` is
  preserved when relevant).
- `/doctor/reports/$id` — metadata + secure view/download.
- Non-completed appointments never show an upload action; the server
  enforces the same rule regardless of what the UI shows.

### Patient document workflow

- `/patient/reports` — every document belonging to the patient.
- `/patient/reports/$id` — metadata + secure view/download. A linked
  document also appears on the corresponding medical-record detail page.

### Secure download implementation

The Phase 9 spec describes a conventional `/api/medical-documents/:id/download`
HTTP route. **This codebase's pinned TanStack Start version doesn't ship
file-based API/server routes** — only `createServerFn` server functions
exist for server-side logic callable from the client — so the download
flow is implemented as `downloadMedicalDocumentFn`
(`src/lib/documents/functions.ts`): an authenticated server function that
resolves ownership exactly like every other document read, reads the bytes
through the storage abstraction, audits the download, and returns them
base64-encoded with the real MIME type and filename. A small client helper
(`src/lib/documents/download-client.ts`) decodes that into a `Blob` and
either opens it in a new tab or triggers a save — there is no separate
public URL for document bytes anywhere in the app.

This achieves the same authorization/audit/no-raw-path guarantees as a
dedicated route would, at the cost of independent HTTP-level cache headers
(moot here, since it's an authenticated in-app call, not a cacheable public
resource) and of base64's ~33% size overhead on the wire. If this project
upgrades to a TanStack Start version with file-based API routes, this is
the function to port to a real `GET /api/medical-documents/:id/download`
handler — the authorization/audit/storage logic underneath wouldn't need
to change.

### Audit logging

New audit actions: `MEDICAL_DOCUMENT_UPLOADED`, `MEDICAL_DOCUMENT_VIEWED`,
`MEDICAL_DOCUMENT_DOWNLOADED`. As with clinical records, metadata is
limited to safe identifiers (actor, document id, appointment id) —
**never** the file's contents or a description of what it contains.
Detail-page opens and successful downloads are both audited; failed
ownership checks return an identical "not found" response for a
wrong-vs-unowned id, so audit logs (and the response itself) never confirm
whether a given id belongs to someone else.

### Delete / retention policy

No hard delete anywhere in this phase — not for patients, doctors,
hospital admins, or platform admins. There is no "delete document" button.
A correction workflow (e.g. superseding a document with a new upload while
keeping the old one for the record) is a future controlled feature, not
implemented here.

### Local development storage

`MEDICAL_UPLOAD_DIR` (default `./private-uploads`) is created automatically
on first upload, is `.gitignore`d, and is never seeded with binary fixture
files — Phase 9's seed data deliberately does not create document rows
pointing at files that wouldn't exist, so a fresh clone always starts with
an empty, consistent Reports page. Upload a real file manually to test the
flow end-to-end.

### Production storage limitation

Only a local-filesystem driver exists. It works for a single-instance
deployment but does not scale across multiple app instances/containers
sharing one disk. Moving to S3/R2/another object store means implementing
`StorageDriver` for that backend and switching the one line in
`storage.server.ts` — no changes to authorization, validation, or the
upload/download functions.

## Messaging & Notifications

Phase 10 adds real, asynchronous in-app messaging between patients and
their doctors, plus a real notification system that other parts of the app
feed into. **No claim of end-to-end encryption or regulatory compliance is
made** — messages are stored as plain text in Postgres, protected by the
same authentication/authorization model as the rest of the app, not by
E2EE.

### Conversation eligibility

A patient and doctor may message each other only if they have at least one
appointment relationship with status `PENDING`, `CONFIRMED`, or
`COMPLETED` (`src/lib/messaging/authorization.server.ts`,
`hasEligiblePatientDoctorRelationship`). A `CANCELLED`/`NO_SHOW`
appointment alone does not grant eligibility, but doesn't need special
handling either — if that's the only appointment between them, the lookup
simply finds nothing. This rule is centralized in one function; every
conversation-creation path goes through it, with no duplicate copies
elsewhere.

One active conversation exists per patient/doctor pair, enforced with a
real **database unique index** (`conversations_patient_doctor_unique`) on
denormalized `patient_id`/`doctor_id` columns on `conversations` — not
just an application-level "check then insert," which can race under
concurrent requests. `findOrCreateConversation` handles the race directly:
if two requests for the same pair both attempt to create the conversation,
Postgres allows exactly one `INSERT` to succeed, and the loser's
unique-violation is caught and turned into a lookup of the row the winner
just created — both callers end up with the same conversation id. Verified
directly in testing with two concurrent creation calls for the same pair.

### Conversation authorization

Every conversation read or write goes through
`requireConversationParticipant`, which joins the session's user id
against `conversation_participants` — a user who isn't a participant gets
back `null`, identical to a nonexistent conversation id, so nothing about
a conversation's existence leaks to someone probing an id that isn't
theirs. Verified: an unrelated patient and an unrelated doctor both get a
plain 404, not an error revealing the conversation exists.

### Messaging implementation

- Message bodies are plain text, 1–6000 characters after trimming; blank
  or whitespace-only messages are rejected server-side (`src/lib/validation/messaging.ts`).
- Sender identity is always the authenticated session user — never
  accepted from the client.
- Sending requires: the sender is a genuine participant; the sender's own
  account is `ACTIVE` (and, if they're a doctor, not `SUSPENDED`); **and**
  the conversation's doctor side isn't operationally suspended. The last
  check blocks new sends from _either_ party once a provider is
  suspended, while leaving all historical messages fully readable —
  verified directly: messages send normally, then both the patient and
  the suspended doctor are blocked from sending after suspension, and
  sending resumes once the doctor is un-suspended.
- Attachments, group chats, typing indicators, and read receipts beyond
  what's described below are explicitly out of scope for this phase.

### Read/unread model

Reused the existing message-level `messages.read_at` column rather than
adding a second participant-level "last read" model — sufficient for 1:1
conversations, which is all Phase 10 supports. Opening a conversation
marks every incoming (not-sent-by-me) unread message read; a sender can
never mark their own message "read by self," and one participant can
never touch the other's read state. Unread counts (used in both the
conversation list and list-level badges) are computed with scalar
subqueries against `messages(conversation_id, read_at)` — a single query
per list, not one query per conversation (Phase 10 rule #13).

### Patient / doctor messaging UI

- `/patient/messages` and `/patient/messages/:id`; `/doctor/messages` and
  `/doctor/messages/:id`. Both list and detail routes deliberately use the
  `.index.tsx` naming convention documented in "Routing Conventions"
  below.
- "Message doctor" / "Message patient" entry points appear on the patient
  appointment detail page, the doctor appointment detail page, and the
  doctor's patient-detail page — all three call the same
  `findOrCreateConversation` service, so the eligibility rule is enforced
  identically regardless of entry point.
- The composer supports Enter-to-send / Shift+Enter-for-newline, shows a
  disabled state with an explanation when sending is currently blocked
  (suspension), and message history loads 50 at a time with a "load older
  messages" cursor rather than an unbounded history fetch.

### Notifications

Reused the existing `notifications` table, extending its `type` enum with
`NEW_MESSAGE`, `APPOINTMENT_COMPLETED`, `VERIFICATION_APPROVED/REJECTED/SUSPENDED`,
`MEDICAL_RECORD_AVAILABLE`, and `MEDICAL_DOCUMENT_AVAILABLE` (the unused
Phase 2 placeholder `DOCTOR_MESSAGE` was renamed to `NEW_MESSAGE` — it had
no other references anywhere in the codebase). All creation goes through
one function, `createNotification` (`src/lib/notifications/service.server.ts`)
— nothing else inserts into this table directly.

**Notification ownership**: every query derives the user from the session;
there is no path to pass a `userId` from the client and read someone
else's notifications. Verified directly.

**NEW_MESSAGE deduplication**: rather than stacking one notification per
message, a rapid burst of messages in the same conversation collapses into
a single unread notification for that conversation, refreshed with the
latest summary text each time it fires. Once the recipient reads it (or
marks all read), the next new message starts a fresh one. Verified: three
rapid messages produce exactly one unread `NEW_MESSAGE` notification, not
three.

**Notification content is deliberately generic** — e.g. "You have a new
message from Dr. Ahmed Raza," never the message text itself, and "Your
doctor added a new medical record to your history," never diagnosis or
clinical detail.

### Existing-event notification integrations

Wired into the real workflows that already existed, each as a best-effort
side effect that can never roll back the primary action if it fails:

- Doctor confirms / cancels / completes an appointment → patient notified
  (`src/lib/doctor/appointments.server.ts`). `NO_SHOW` deliberately isn't
  notified — it isn't a useful thing to surface as an alert to the patient.
- Doctor creates a medical record, issues a prescription, or uploads a
  document → patient notified in each case.
- Admin approves / rejects / suspends a **doctor's** verification → that
  doctor notified. Hospital verification decisions are **not** notified in
  this phase — a hospital has no single reliable "the account" to notify
  (verification events are tied to the hospital, not to one specific
  hospital-admin user), and inventing one would be guessing.

### Real-time behavior

No WebSockets in this phase. The header notification bell polls a single
lightweight count query every 45 seconds
(`src/lib/notifications/useUnreadCount.ts`); conversation views refresh via
normal route revalidation after sending a message. This is a deliberate
trade-off, not an oversight — see the Phase 11 recommendation below.

### Privacy / security boundaries

- Message bodies never appear in generic audit-log metadata. Audit events
  (`CONVERSATION_CREATED`, `MESSAGE_SENT`, `NOTIFICATIONS_MARKED_READ`)
  record only actor id, conversation/message id, and counts.
- Hospital admins and platform admins have no routine path to conversation
  content anywhere in the app — verified directly: the hospital
  dashboard's own rendered HTML was checked and contains no message text.
- No group chats, no attachments, no typing/online/presence indicators, no
  fake read receipts beyond the real persisted read state described above.

### Known limitations

- Live delivery is added in Phase 11 (best-effort SSE, single-instance hub) — see
  "Real-Time Messaging & Notifications". No push/email/SMS notifications.
- No message editing or deletion.
- No care-team / multi-doctor conversations — strictly 1:1 patient/doctor.
- Hospital verification decisions don't generate notifications (no
  reliable single-account relationship to target).
- This is not a HIPAA/GDPR-compliant messaging system, and no such claim
  is made.

## Real-Time Messaging & Notifications

Phase 11 adds live delivery on top of the Phase 10 messaging/notification
system. **PostgreSQL remains the only source of truth.** The realtime layer is a
delivery/invalidation hint, never storage.

### Transport: Server-Sent Events (SSE)

Endpoint: `GET /api/realtime/stream` (`src/routes/api.realtime.stream.ts`).

Why SSE and not WebSockets: Medix only needs server → client pushes (sending
already works through authenticated server functions), and the app is built as
a plain `fetch(Request) → Response` handler (`vite.config.ts` does not load the
Nitro plugin, despite older README wording), for which there is no supported
WebSocket upgrade path. A streaming `Response` works in `vite dev` and
`vite preview`/production Node serving, and was verified in both. Only one
transport is implemented.

### Architecture

```
server function validates + authorizes  ─▶  DB transaction commits
        ─▶  events.server.ts publishes (recipient id from DB rows)
        ─▶  RealtimeHub delivers ONLY to that user's connections
        ─▶  browser gets a tiny hint ─▶ re-fetches through the normal,
            participant-checked server functions (PostgreSQL)
```

- `src/lib/realtime/types.ts` – event model (client-safe)
- `src/lib/realtime/hub.server.ts` – `RealtimeHub` interface + in-memory implementation
- `src/lib/realtime/events.server.ts` – the **only** place business code publishes; never throws
- `src/lib/realtime/stream.server.ts` – authenticates and serves the SSE stream
- `src/lib/realtime/client.ts` – one shared `EventSource` per browser tab, hooks, coalescer

Publishing points: `sendMessage` (after the message row + conversation touch
commit in one transaction), `createNotification` (every notification type flows
through it, so appointment/record/prescription/document/verification/message
notifications all go live), `markNotificationRead`/`markAllNotificationsRead`,
`markConversationRead`.

### Events

`MESSAGE_CREATED`, `CONVERSATION_READ`, `NOTIFICATION_CREATED`,
`NOTIFICATION_READ`, `NOTIFICATIONS_READ_ALL`. Payload: `id`, `type`, `timestamp`
and optionally `conversationId` / `messageId` / `notificationId`. **No message
bodies, names, clinical text or document contents are ever sent.** Receiving an
event is not authorization: the client re-fetches, and the server re-checks
participation exactly as before (a non-participant gets the same result as for a
nonexistent conversation).

### Authentication and recipient scoping

- The stream authenticates from the httpOnly session cookie only. `userId`,
  `role`, `patientId`, `doctorId` query parameters are ignored (no cookie → 401).
  Requests marked `Sec-Fetch-Site: cross-site` get 403.
- Events are addressed to a user id derived from database rows (conversation
  participants, notification owner). The hub keeps a per-user connection map;
  nothing is broadcast and filtered client-side. Patient A never receives Patient B's
  events; Hospital/Platform admins receive no clinical-message events (they only
  ever receive events for notifications addressed to their own user id).
- At most 10 concurrent streams per user (oldest evicted).

### Read state, multi-tab, ordering

- An open, **visible** conversation refreshes through `refreshConversationFn`
  and marks the caller's own incoming messages read server-side _before_
  fetching (no mark/fetch race). Hidden tabs do not mark messages read; they
  catch up when the tab becomes visible.
- `CONVERSATION_READ` / `NOTIFICATION_READ(_ALL)` go only to the acting user's
  other tabs. Nothing is sent to the other party: **no read receipts** are exposed.
- Messages are merged by id and keep PostgreSQL's order; duplicate/late events
  cannot duplicate or drop rows. Bursts are coalesced (one revalidation per
  burst, serialized, with backoff retry on failure).

### Reconnect, keepalive, fallback

- Heartbeat `ping` event every 25 s (`REALTIME_HEARTBEAT_MS`); the client
  reconnects if nothing arrives for 70 s (detects half-open connections).
- Reconnect uses jittered exponential backoff (1 s → 30 s). **Every** (re)connect
  triggers a revalidation, because events may have been missed offline or between
  server render and stream registration. One extra fetch per full page load.
- The layout shows "Live updates paused — reconnecting…" only while
  reconnecting. There is no online/presence indicator.
- If the stream is unavailable the app keeps working. The bell falls back to the
  Phase 10 45 s poll; while the stream is healthy it only does a 5-minute safety poll.
  Failed revalidations retry with backoff and also fire on the browser `online` event.

### Session revocation

- Logout, password reset and admin **account suspension** close that user's live
  streams immediately (the stream sends `session-ended` and the browser stops
  reconnecting).
- Independently, every open stream re-checks its session (exists, not expired,
  account not suspended/deactivated) every 30 s (`REALTIME_SESSION_RECHECK_MS`),
  so a revocation done elsewhere cannot leave a stream authorized indefinitely.
- Provider _verification_ suspension (Phase 10 rule) does not revoke sessions: the
  doctor keeps read access and cannot send; patients cannot send to that doctor.

### Delivery guarantees (be precise)

Realtime delivery is **best-effort**. It is not guaranteed and there is no event
log/outbox. The message and notification are committed before any event is
published, so a lost event never loses data: the client fixes up from PostgreSQL
on reconnect, on tab focus and via fallback polling. If the server restarts the
in-memory hub resets; clients reconnect and resync.

### Production scaling limitation and deployment requirements

- **The in-memory hub only works when the sender's and recipient's connections
  are held by the same app instance.** With several instances (containers,
  serverless replicas, clusters) live delivery would be partial. Replace
  `InMemoryRealtimeHub` with a broker-backed `RealtimeHub` (e.g. Redis Pub/Sub keyed
  per user, or a managed realtime service) before scaling out. No broker is
  introduced yet. Session revocation also relies on the 30 s recheck across instances.
- The host must support long-lived streaming responses without buffering (the
  response sets `Cache-Control: no-store` and `X-Accel-Buffering: no`) and must not
  cut idle connections shorter than the 25 s heartbeat. Serverless platforms with
  short function time limits are unsuitable for this transport.
- Each open tab holds one connection. Browsers limit HTTP/1.1 to 6 connections per
  origin, so with ~6 tabs of the same site open over plain HTTP/1.1, other requests can
  queue (observed in testing). HTTP/2 removes this limit; serve production over HTTP/2.
- Not claimed: guaranteed delivery, end-to-end encryption, HIPAA or GDPR compliance.
- Database: **no schema change** in Phase 11. (Migration `0007` had been missing
  from `drizzle/meta/_journal.json`, so fresh databases never received it; the journal
  entry was added.)

### Tests

`npm run test:realtime` runs the hub/client/coalescer/merge tests (no database).
`tests/e2e/*.py` are Playwright scripts (real Chromium, real PostgreSQL, running
server) for live messaging, scoping/auth/revocation, disconnect/resync, restart,
routing, notification types and connection lifecycle. Run them with
`npm run test:e2e`: the runner creates the disposable test database, applies the
E2E fixtures (`tests/support/e2e-fixtures.ts`), starts/stops the app and applies each
script's server settings — see [Testing, CI & Production Readiness](#testing-ci--production-readiness).

## Billing, Payments & Refunds

Phase 12 adds an **internal billing system**: invoices, payments and
refunds. **There is no payment gateway.** Every payment/refund is staff
attesting that a real-world CASH/bank settlement happened outside this
system — no card is ever charged, and no card/CVV/PIN data is collected or
stored anywhere.

### Money representation (a documented decision)

The pre-existing schema already stored money as `numeric(10,2)` decimal
strings (`appointments.fee`, `doctors.consultationFee`). Rather than migrate
that history to integer minor units, Phase 12 keeps `numeric(10,2)` as the
on-disk representation for all new billing columns too, for consistency —
but never does arithmetic in floating point. `src/lib/billing/money.ts`
converts every amount to integer minor units (paisa) for addition,
comparison and validation, and only formats back to a decimal string for
storage/display. Default currency is `PKR`.

### Fee snapshot & invoice creation policy

An appointment's fee is snapshotted once at booking time from the doctor's
`consultationFee` (pre-existing Phase 1–11 behavior) and never re-read
afterwards. **An invoice is created when the doctor CONFIRMS the
appointment** — not at booking — because a PENDING appointment can still be
rejected or never confirmed, and a visit that never happened shouldn't be
billed. CONFIRM is the one existing, consistent state transition
(`applyDoctorAppointmentAction`) that marks an appointment as a real,
committed visit. Invoice creation happens in the SAME database transaction
as the CONFIRM update, using the appointment's frozen fee — never the
doctor's _current_ fee. One invoice per appointment is enforced with a
unique index on `invoices.appointment_id`, not just application code.

Invoice numbers (`MED-2026-000123`) come from a Postgres `SEQUENCE`
(`invoice_number_seq`), so two concurrent confirmations can never collide —
the unique index on `invoice_number` is the final safety net.

### Payment methods & lifecycle

Controlled enum: `CASH`, `MANUAL` (bank transfer), `TEST` (simulated,
development only). Invoice status: `DRAFT → ISSUED → PARTIALLY_PAID → PAID`,
plus `VOID`, `REFUNDED`, `PARTIALLY_REFUNDED`. Partial payments are
supported — the outstanding balance is `total − amountPaid`, recomputed
after every payment.

### Who may record a payment or refund

**The patient can never mark their own invoice as paid or self-issue a
refund** — no server function exists for this at all (a structural
guarantee, not just a UI omission). A Hospital Admin may record
payment/refund only for invoices belonging to their own hospital
(`resolveHospitalContext()` — never a client-supplied `hospitalId`). An
appointment with no hospital (a pure online consult) has an invoice nobody
"owns" in the hospital sense; the documented Phase 12 policy is that only
the **Platform Admin** may record payment/refund for those, and Platform
Admin is otherwise strictly read-only oversight over every other invoice —
no clinical content, no arbitrary financial editing.

### Concurrency, idempotency, over-payment/over-refund

Both `recordPayment` and `recordRefund` take a `SELECT ... FOR UPDATE` row
lock on the invoice before any money math happens, inside one DB
transaction — this is what makes concurrent requests for the same invoice
fully serialized, not the UI. A compare-and-swap `WHERE` guard on the final
`UPDATE` is defense-in-depth on top of that lock. Verified against real
PostgreSQL in `tests/billing/concurrency.test.ts`: firing two simultaneous
full-amount payments on the same invoice, only one ever succeeds; firing ten
concurrent partial payments that together would overpay, exactly the number
that fit is accepted; two simultaneous full refunds on the same payment,
only one succeeds. `amountPaid` can never exceed `total`; `amountRefunded`
can never exceed `amountPaid` — both invariants are asserted directly
against the database after each concurrency test, not just against the
function's return value.

Payment recording accepts an optional client-generated `idempotencyKey`; a
repeated submit with the same key (double-click, retry after a dropped
response) returns the original payment instead of charging twice, enforced
by a unique index on `(invoiceId, idempotencyKey)`.

### Cancellation policy

- Appointment cancelled **before** any payment (invoice still `ISSUED`,
  `amountPaid = 0`) → the invoice is automatically `VOID`ed.
- Appointment cancelled **after** money was collected → the invoice is left
  exactly as-is (`PAID`/`PARTIALLY_PAID`). Nothing is auto-refunded or
  silently voided; an authorized Hospital/Platform Admin must use the
  explicit refund workflow. An appointment cancelled before it was ever
  confirmed has no invoice yet (invoices only exist from CONFIRM onward), so
  this is a no-op for it.

### Receipts

Every completed payment has a receipt number (`RCPT-MED-2026-000123-1`),
shown on the patient's invoice detail page alongside method, date and
status. Printing uses the browser's own Print / Save-as-PDF — no PDF
generation library was added.

### Notifications & realtime (reusing Phase 11, not a separate system)

`INVOICE_ISSUED`, `PAYMENT_RECORDED` and `REFUND_RECORDED` notifications are
created through the **same** `createNotification()` used by every other
Phase 10/11 notification type, so they automatically get a persisted
notification row and a Phase 11 SSE event — no new realtime plumbing was
built. Notifications are published only **after** the DB transaction
commits; a realtime delivery failure can never lose or roll back financial
data. The patient's invoice detail page and billing list both subscribe to
`NOTIFICATION_CREATED` and revalidate live — a Hospital Admin recording a
payment is visible to an already-open patient tab within seconds, with no
reload, and the payload carries only ids, never an amount or clinical text.

### Audit logging

`INVOICE_CREATED`, `PAYMENT_RECORDED`, `REFUND_RECORDED` and (structurally
available) `INVOICE_VOIDED` audit actions record identifiers and amounts
only — never medical record text, card details, or session tokens.

### Security boundaries (verified against real PostgreSQL)

- A patient can view only their own invoices; another patient's invoice id
  resolves the same as a nonexistent one.
- A Hospital Admin can act only on their own hospital's invoices; another
  hospital's invoice is likewise indistinguishable from nonexistent, and an
  unauthorized attempt changes nothing in the database.
- A Doctor sees only a read-only payment-status list for their own
  appointments — never amounts collected platform-wide, and explicitly
  labelled as _not_ representing payouts (Medix does not process doctor
  payouts).

### Known limitation

Payment and refund concurrency correctness has been verified directly
against PostgreSQL (`tests/billing/concurrency.test.ts`), but this phase
does not claim PCI-DSS compliance or real online payment processing of any
kind — see "No fake card/checkout" above.

## Public Provider Directory, Reviews & Favorites

Phase 13 replaced the last mock provider data on public pages with PostgreSQL. `/doctors`, `/doctors/$id`, `/hospitals`, `/hospitals/$id`, `/specialties`, `/specialties/$slug` and the homepage provider sections are all database-backed.

### Provider visibility policy

One definition, `src/lib/directory/visibility.server.ts`, is used by the directory, search, specialty pages, homepage, public detail routes, favorites **and** booking discovery, so they cannot drift:

- **Doctor is public** when: own user account `ACTIVE` + `verification_status = APPROVED` + `is_available = true`.
- **Hospital is public** when `verification_status = APPROVED` (hospitals have no separate account flag).
- Pending / rejected / suspended providers are filtered **in SQL**, never in the browser. A hidden provider's detail URL is "not found".
- Suspension changes only `verification_status`: appointments, records, invoices, messages and reviews stay in the database. Reactivation restores public visibility (and the historical reviews with it). A doctor's card lists only _approved_ hospitals; a suspended hospital also stops taking **new** bookings.

### Search, filters, sorting, pagination

- State lives in the URL (`/doctors?specialty=cardiology&sort=rating&page=2`) and is validated server-side by lenient zod schemas (`src/lib/validation/directory.ts`): invalid values fall back to "no filter" instead of erroring.
- Search is PostgreSQL `ILIKE` with literal matching (`%`, `_`, `\` are escaped), max 80 characters, up to 5 terms that must all match somewhere: doctor name, qualification, specialty, hospital name/city (doctors); name, city, address, specialty, department, service (hospitals). A leading "Dr." is ignored.
- Doctor filters (only ones backed by real data): specialty, hospital, city (via approved affiliation), fee range, minimum rating, minimum experience, appointment mode (from active availability rules), "has an open booking schedule". Hospital filters: specialty, city, department, service. Dropdown options are real values from the database.
- Sorting uses a **whitelist** (`recommended | rating | reviews | fee_asc | fee_desc | experience`; hospitals `recommended | rating | reviews | doctors | name`). "Recommended" = rating, then review count, then experience, then name. The client only ever sends the key, never SQL.
- Pagination is server-side (`items, page, pageSize, total, totalPages`; default 12, max 50; out-of-range pages are clamped). A page costs a constant number of SQL statements (count + page + batched specialties/affiliations/availability/favorites) — covered by a test.

### Rating source

Ratings are **derived at query time** from `PUBLISHED` rows in `reviews` (`AVG(rating)`, `COUNT(*)`; `src/lib/reviews/aggregate.server.ts`). Nothing is stored, so edits, hiding and restoring are reflected immediately and cannot drift. `doctors.rating` / `doctors.total_reviews` are **deprecated and unused** (kept to avoid a destructive migration). A provider with no reviews shows "No reviews yet", never a fake `0.0`. Hospital rating = average of published reviews attached to completed visits _at that hospital_ (`reviews.hospital_id` is copied from the appointment), labelled as such in the UI.

### Reviews

- **Eligibility:** only the authenticated patient who owns a `COMPLETED` appointment. One review per appointment (`reviews_appointment_unique`, also race-safe via `ON CONFLICT DO NOTHING`). Pending / confirmed / cancelled / no-show and other patients' appointments are rejected (a foreign appointment is indistinguishable from a missing one).
- **Server-derived identity:** the browser sends only `appointmentId`, `rating`, `comment`. `patientId`, `doctorId` and `hospitalId` are read from the appointment row; extra fields are ignored.
- **Validation:** integer rating 1–5 (also a DB CHECK); comment optional, trimmed, 10–1500 characters (DB CHECK ≤ 2000), no HTML-like tags or control characters. Comments render as plain text.
- **Edit:** only the author can edit their own published review; `edited_at` is set and "edited" is shown. Doctors, hospital admins and admins have no edit path.
- **Remove:** the author can remove (hide) and restore their own review. Rows are never hard-deleted. Doctors/hospitals cannot delete reviews.
- **Moderation:** a platform admin can **hide** a review with a required reason (`/admin/reviews`) and restore a moderator-hidden review. Content is preserved, never edited; a patient cannot restore a moderator-hidden review and an admin cannot restore one the patient removed. Reviews are not pre-moderated.
- **Audit:** `REVIEW_CREATED / UPDATED / HIDDEN / RESTORED`, written in the same transaction as the change; metadata holds ids/ratings/flags only, never review text. The doctor receives one generic "New patient review" notification (no patient details).
- **Public display:** privacy-conscious names ("Tariq K."), server-paginated 5 at a time. Suspended providers' reviews are not shown publicly.

### Favorites

`favorite_doctors` / `favorite_hospitals` (unique patient+provider pair). Identity is always the session patient; the API has no `patientId` input. The client states the desired state, so add/remove are idempotent and concurrent double-clicks cannot create duplicates. You can only newly favorite a _public_ provider. If a favorited provider is later suspended the row is **kept** and shown under "Currently unavailable" (name only) on `/patient/favorites`; it returns on reactivation. Signed-out visitors are sent to `/login`. Button state comes from the database, not `localStorage`.

### Booking integration and data boundary

Every "Book" button links to the existing Phase 4 flow (`/book?doctor=<id>`); there is no second booking or availability implementation. "Next available" on a profile is computed by the same slot generator the booking flow uses. Public pages receive only explicit DTOs (`src/lib/directory/types.ts`) — never raw rows — so user emails, license numbers, verification reasons/history, audit data, patient data, billing and hospital staff cannot reach the browser (asserted by tests and a client-bundle scan).

### Tests

`npm run test:directory` (real PostgreSQL, behind the fail-closed test-database guard) covers visibility, the admin suspend/reactivate lifecycle, search/filter/sort/pagination, hostile input, DTO leakage, query counts, all review rules, moderation and favorites (including concurrency and cross-patient isolation). `tests/e2e/e10_directory.py` is the Playwright cross-role E2E. Tests run only against the disposable database created by `npm run test:db:setup` (see [Test database safety](#test-database-safety-fail-closed)); fixtures use unique tokens so they are re-runnable, and `npm run test:db:reset` gives a clean slate.

### Known limitations

- Hospital ratings are derived from doctor-visit reviews at that hospital; there is no separate "review the hospital" flow.
- Search is `ILIKE` (fine at current scale); there is no trigram/full-text index, ranking or typo tolerance.
- The directory lists doctors only if `is_available` is true, so a doctor who pauses bookings also leaves the directory.
- Static content that is **not** provider data still comes from `src/data/mock`: health articles, and the prescriptions/reports widgets on the patient dashboard. `nav-config.ts` holds placeholder display names that every portal layout overrides with the signed-in user.
- Reviews are published immediately (no pre-moderation); moderation is reactive.

## Migration Strategy & Audit (Phase 8 → 9)

This project uses Drizzle migrations (`npm run db:migrate`) as the only
sanctioned path to a production schema. `drizzle-kit push` is a
development convenience for quickly syncing a local database and **must
not** be used as a deployment strategy — it doesn't update Postgres in a
reviewable, repeatable way, and it doesn't write to
`drizzle.__drizzle_migrations`, which is exactly the mismatch that caused
the issue below.

**What was found:** `drizzle/meta/_journal.json` was missing its entry for
`0004_busy_famine.sql` even though that migration's SQL file and snapshot
already existed on disk (a bug from before Phase 8, not introduced by it).
Phase 8 restored the journal entry and added `0005_glamorous_nehzno.sql`
after it. On the maintainer's existing development database, this meant
`npm run db:migrate` reported success but didn't actually apply the new
Phase 8 columns — drizzle's migrator only compares the _latest_ recorded
migration's timestamp against the journal, so a bookkeeping mismatch like
this can silently skip work rather than error. The database was
subsequently synced with `drizzle-kit push`, which fixed the schema but
left `__drizzle_migrations` still out of sync with the file-based history.

**How this was verified and made reproducible for Phase 9:** a real,
completely empty PostgreSQL 16 database was created and taken through
`npm install` → `npm run db:migrate` → `npm run db:seed`, with **no**
`drizzle-kit push` at any point. All 7 migrations (`0000`–`0006`) applied
successfully in order, producing the full, correct schema — the migration
chain itself was never broken; only one existing database's bookkeeping
was. This is the standard this project holds itself to going forward: any
fresh database must reach the current schema through migrations alone.

**Reconciling an existing `push`-synced database:** if your development
database was ever synced with `drizzle-kit push` instead of
`db:migrate`, running `db:migrate` afterwards can fail or silently skip
work, because `push` never records anything in
`drizzle.__drizzle_migrations`. Do not run `push` again to "fix" this —
it just re-creates the same mismatch. Reconcile it once instead: apply any
schema this database is missing directly (idempotent — safe to run more
than once) and then insert a correct bookkeeping record so `db:migrate`
recognizes the current state and only applies genuinely new migrations
after it.

## Routing Conventions (list/detail file naming)

TanStack Router's flat file-based routing treats `a.b.tsx` as the **parent**
of `a.b.$id.tsx` unless the list file is named `a.b.index.tsx` instead — a
bare `a.b.tsx` list page becomes a layout route that must render its own
`<Outlet />` for the `$id` child to display at all. Several pre-existing
list pages in this codebase used the bare naming, which meant their detail
pages matched correctly (the URL and page title updated) but silently
rendered the parent list's content instead of the actual detail page, with
no console or server error — because nothing actually threw. Once found,
the fix was mechanical: rename the list file to `.index.tsx` (with a
trailing slash in its `createFileRoute("...")` path string) so it becomes
a true sibling of the `$id` route rather than its parent.

Every list/detail pair in this codebase now uses `.index.tsx` naming, and
this was verified directly (not just type-checked) by fetching each
detail page over real HTTP with a real session and confirming the
response body contains that page's actual content — not its list page's.
Any new list/detail pair added to this project **must** follow the same
convention from the start.

## Deployment Notes

`npm run build` produces a server-renderable `dist/server` (a standard
`fetch(Request) → Response` handler) plus `dist/client` via TanStack Start; the
Nitro plugin is **not** loaded in `vite.config.ts`. The custom server entry
at `src/server.ts` wraps the generated handler to normalize unhandled SSR
errors into a friendly error page, and can be adapted to whichever hosting
target you deploy to (Node server, edge/worker runtime, etc.). Configure a
deployment target and any required environment variables as the backend is
built out.

## Roadmap

The following are intentionally **not** implemented yet and are planned for
later phases:

- Google OAuth (password auth is implemented; OAuth was out of scope)
- Real payment gateway integration (Stripe/Easypaisa/JazzCash/bank APIs) — Phase 12 adds internal billing (invoices/payments/refunds) with no live card processing; see "Billing, Payments & Refunds"
- Doctor payouts, insurance claims, subscriptions, installment financing — see "Billing, Payments & Refunds" for what is deliberately out of scope
- Moving the remaining static content (health articles, patient-dashboard prescriptions/reports widgets) off `src/data/mock`
- Medical record amendment history (edits currently overwrite in place; see Known limitations above)
- Malware scanning for uploaded documents (see "Medical Documents" above — allowlist + magic-byte checks exist, a real scanner does not)
- Cloud object storage for medical documents (local filesystem only; see "Production storage limitation" above)
- Document correction/versioning workflow (no delete/replace yet, by design)
- Distributed realtime broker (Redis Pub/Sub or managed) for multi-instance deployments — see "Real-Time Messaging & Notifications"
- Message editing/deletion, and care-team (multi-doctor) conversations
- Hospital staff management
- Live video consultations
- Reschedule flow (only cancel is implemented, on both patient and doctor sides)
- Hospital staff management, rooms/beds, and hospital analytics (see "Intentionally deferred" under Hospital Portal)
