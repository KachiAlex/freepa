import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config(); // also pick up a .env in the process cwd, if present

export const config = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/freepa',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  // Anchored to this file (server/src or server/dist) so paths resolve
  // identically no matter where the process is launched from.
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? path.join(__dirname, '..', 'uploads')),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://localhost:${Number(process.env.PORT ?? 8080)}`).replace(/\/$/, ''),
  frontendDist: path.resolve(
    process.env.FRONTEND_DIST ?? path.join(__dirname, '..', '..', 'frontend', 'dist'),
  ),
  invoiceApiKey: process.env.INVOICE_API_KEY,
  paymentSuccessRedirect: process.env.PAYMENT_SUCCESS_REDIRECT ?? 'https://example.com/payments/success',
};

const requiredEnvVars = [
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_WEBHOOK_SECRET',
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_WEBHOOK_SECRET',
] as const;

type RequiredEnvKey = (typeof requiredEnvVars)[number];

export function getEnv(key: RequiredEnvKey): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}
