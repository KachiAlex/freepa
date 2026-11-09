# FreePA Platform

FreePA is a self-hosted, multi-tenant invoicing platform: a React/Vite frontend and a single Node.js (Express) server backed by PostgreSQL, with payment integrations for Flutterwave and Paystack. It is designed to run on a VPS — one process serves both the REST API and the built frontend.

## Project Structure

- `frontend/`: React application for customers and platform administrators.
- `server/`: Express server — REST API, JWT auth, PostgreSQL data layer, payment webhooks, reconciliation job, file uploads, and static hosting of the frontend build.
- `server/src/db/migrate.ts`: idempotent schema migrations (run automatically at server start).
- `server/scripts/grant-admin.mjs`: grant/check/revoke the `platform_admin` flag for a user.

## Prerequisites

- Node.js 18+
- PostgreSQL 13+ (uses `gen_random_uuid()`)
- Flutterwave & Paystack credentials (for payment flows)

## Local Setup

1. Clone the repository and install workspace dependencies:

   ```bash
   git clone https://github.com/KachiAlex/freepa.git
   cd freepa
   npm run install:all
   ```

2. Configure environment variables:

   - Copy `server/env.sample` to `server/.env` and fill in `DATABASE_URL`, `JWT_SECRET`, and provider keys.
   - Copy `frontend/env.sample` to `frontend/.env` if the API runs on a different origin (not needed for local dev — the Vite dev proxy forwards `/api`, `/uploads`, `/webhooks` to `localhost:8080`).
   - **Never commit `.env`** — it is ignored via `.gitignore`.

3. Create the database and apply migrations (also runs automatically on server start):

   ```bash
   createdb freepa
   npm run migrate
   ```

4. Run the app in dev mode (two terminals):

   ```bash
   npm run dev:server     # API on http://localhost:8080
   npm run dev:frontend   # Vite dev server (proxies API calls)
   ```

## Deployment (VPS)

1. Install Node.js 20 and PostgreSQL on the server. Create a database and user:

   ```sql
   CREATE DATABASE freepa;
   CREATE USER freepa WITH PASSWORD 'strong-password';
   GRANT ALL PRIVILEGES ON DATABASE freepa TO freepa;
   ```

2. Copy the repo to the VPS, install dependencies, and build:

   ```bash
   npm run install:all
   npm run build
   ```

3. Configure `server/.env` for production (`DATABASE_URL`, `JWT_SECRET`, `PUBLIC_BASE_URL`, `UPLOAD_DIR`, provider secrets, `INVOICE_API_KEY`).

4. Run the server behind a process manager:

   ```bash
   npm start                  # serves API + built frontend on $PORT
   # or with pm2: pm2 start npm --name freepa -- start
   ```

5. Point nginx/caddy at `http://localhost:8080` (TLS termination, gzip, etc.). Provider webhooks should target:

   - `https://your-domain.com/webhooks/flutterwave`
   - `https://your-domain.com/webhooks/paystack`

## Admin Access

Platform-wide administration requires `platform_admin = true` on the user row. The user must sign up first, then:

```bash
cd server
node scripts/grant-admin.mjs --email=admin@example.com          # grant
node scripts/grant-admin.mjs --email=admin@example.com --check  # check
node scripts/grant-admin.mjs --email=admin@example.com --revoke # revoke
```

Existing platform admins can also grant/revoke from the `/admin/users` UI.

Unlike the previous Firebase version, role and admin changes take effect on the next API call — no token refresh needed, since membership is resolved per request from the database.

## API Overview

- `POST /api/auth/signup|signin|reset-password`, `GET /api/auth/me` — JWT auth (Bearer token).
- `GET|POST /api/organizations`, `GET /api/organizations/:id`, `PATCH /api/organizations/:id/profile` — tenant provisioning and profile/branding.
- `GET /api/organizations/:id/members`, `POST .../members/role`, `DELETE .../members/:uid` — membership + roles (`owner|admin|manager|editor|finance|viewer`).
- `GET|POST /api/organizations/:id/invoices`, `GET|PATCH .../invoices/:iid`, `POST .../invoices/:iid/status`, `POST .../invoices/:iid/pdf`, `POST .../invoices/:iid/payment-intent`.
- `GET /api/organizations/:id/clients`, `GET /api/organizations/:id/payments`.
- `POST /api/organizations/:id/uploads/logo` — multipart logo upload (≤3MB, images only); files served from `/uploads/*`.
- `GET /api/admin/stats|users|organizations|invoices|payments`, `POST /api/admin/grant|revoke` — platform admin console APIs.
- `POST /webhooks/flutterwave|paystack` — signature-verified payment webhooks.
- `POST|GET|PATCH /api/v1/invoices…` — external API for programmatic invoice access; auth via `x-api-key` (matches `INVOICE_API_KEY`) or a platform-admin JWT.

## Secrets Management

All secrets live in `server/.env` (see `env.sample`). The payment providers' webhook secrets verify HMAC signatures on `/webhooks/*` endpoints.

## Continuous Integration

The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) to lint and build both projects on every push or pull request to `master`.

## Troubleshooting

- **401 on every API call**: token cleared/expired — sign in again. If it persists, check `JWT_SECRET` is stable across restarts.
- **"Missing environment variable: FLUTTERWAVE_..."**: set provider keys in `server/.env` before using payment endpoints.
- **Logo upload fails**: ensure `UPLOAD_DIR` exists/writable; files must be `image/*` and under 3MB.
- **Permission denied**: confirm the member's role in `members` covers the action; platform admins bypass role checks.
