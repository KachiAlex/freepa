# FreePA Platform

FreePA is a Firebase-backed multi-tenant invoicing platform featuring payment integrations (Flutterwave, Paystack), a React/Vite frontend, and Firebase Cloud Functions for APIs, webhook handling, and administration.

## Project Structure

- `frontend/`: React application for customers and platform administrators.
- `functions/`: Firebase Cloud Functions (callable, HTTP, and background triggers).
- `firestore.rules`, `storage.rules`: Production security rules.
- `checkAdminClaim.js`: Utility script to verify custom claims locally (requires service account).

## Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- GitHub repository (e.g. [`KachiAlex/freepa`](https://github.com/KachiAlex/freepa))
- Firebase project (`freepa-76b26`)
- Flutterwave & Paystack credentials

## Local Setup

1. Clone the repository and install workspace dependencies:

   ```bash
   git clone https://github.com/KachiAlex/freepa.git
   cd freepa
   npm install
   npm install --prefix frontend
   npm install --prefix functions
   ```

2. Configure environment variables:

   - Copy `frontend/env.sample` to `frontend/.env` and populate with Firebase web config and public keys.
   - Copy `functions/env.sample` to `.env.local` or set via `firebase functions:config:set` (see below).
   - **Never commit secret files** (`service-account.json`, `.env`) — they are ignored via `.gitignore`.

3. Provide a Firebase service account key locally (for scripts/emulators). Keep the JSON outside version control.

4. Run the emulators:

   ```bash
   npm run lint --prefix frontend
   npm run build --prefix frontend
   npm run serve --prefix functions
   ```

   Update the emulator command to match the services you need.

## Deployment Workflow

1. Authenticate with Firebase:

   ```bash
   firebase login
   firebase use freepa-76b26
   ```

2. Build and deploy:

   ```bash
   npm run build --prefix frontend
   firebase deploy --only hosting
   npm run deploy --prefix functions
   ```

3. Verify hosting at `https://freepa-76b26.web.app`.

## Admin Access & Claims

Platform-wide administration requires the `platformAdmin: true` custom claim.

Options to grant the claim:

- **Callable function** (recommended): Use the `grantPlatformAdmin` callable from a secure admin context.
- **Node script**: Place a service account key locally and run:

  ```javascript
  const admin = require("firebase-admin");
  const serviceAccount = require("./service-account.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  const uid = "FIREBASE_UID";

  admin
    .auth()
    .setCustomUserClaims(uid, { platformAdmin: true })
    .then(() => console.log("platformAdmin claim set"))
    .catch(console.error);
  ```

After updating claims, users must sign out/in to refresh tokens.

## Secrets Management

- Keep sensitive keys in Firebase Functions Config:

  ```bash
  firebase functions:config:set \
    payments.invoice_api_key="generated-key" \
    flutterwave.secret_key="FLW_SECRET" \
    flutterwave.webhook_secret="FLW_WEBHOOK_SECRET" \
    paystack.secret_key="PAYSTACK_SECRET" \
    paystack.webhook_secret="PAYSTACK_WEBHOOK_SECRET"
  ```

- Use GitHub Secrets for CI (`FIREBASE_SERVICE_ACCOUNT`, etc.) if workflows need deployment access.

## Continuous Integration

The repository includes a GitHub Actions workflow (`.github/workflows/ci.yml`) to lint and build both projects on every push or pull request to `master`. Ensure commands stay fast to contain billing on the Firebase Blaze plan.

## Cost Optimisation Tips

- Prefer callable functions over HTTP endpoints when possible to leverage Firebase Auth automatically.
- Use indexed Firestore queries and avoid unnecessary aggregation reads.
- Clean up unused emulated data before production deploys.
- Monitor usage via Firebase console and set billing alerts.

## Troubleshooting

- **auth/invalid-api-key**: Ensure `frontend/.env` contains the correct Firebase web API key.
- **Missing or insufficient permissions**: Confirm security rules include `platformAdmin` exceptions and that custom claims are refreshed.
- **500 from admin functions**: Check Cloud Function logs; ensure service account has required Firestore access and data schema matches expectations.

For detailed history and context, review commit messages and the admin dashboard implementation within `frontend/src/pages/admin/`.


