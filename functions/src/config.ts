import * as functions from 'firebase-functions';

const requiredEnvVars = [
  'FLUTTERWAVE_SECRET_KEY',
  'FLUTTERWAVE_WEBHOOK_SECRET',
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_WEBHOOK_SECRET',
] as const;

type RequiredEnvKey = (typeof requiredEnvVars)[number];

function resolveValue(key: string): string | undefined {
  if (process.env[key]) {
    return process.env[key];
  }

  const configNamespace = functions.config()?.payments ?? {};
  return configNamespace[key.toLowerCase()];
}

export function getEnv(key: RequiredEnvKey): string {
  const value = resolveValue(key);
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

export function getOptionalEnv(key: string): string | undefined {
  return resolveValue(key);
}

