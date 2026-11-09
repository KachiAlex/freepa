// Grants (or checks) platform admin for a user email.
// Usage:
//   node scripts/grant-admin.mjs --email=admin@example.com
//   node scripts/grant-admin.mjs --email=admin@example.com --check
//   node scripts/grant-admin.mjs --email=admin@example.com --revoke
//
// Reads DATABASE_URL from server/.env if present.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg) => arg.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? true]),
);

const email = (args.email ?? '').toString().trim().toLowerCase();
if (!email) {
  console.error('Usage: node scripts/grant-admin.mjs --email=admin@example.com [--check|--revoke]');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/freepa';
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const found = await pool.query('SELECT id, email, platform_admin FROM users WHERE email = $1', [email]);
  if (found.rows.length === 0) {
    console.error(`No user found for ${email}. The user must sign up first.`);
    process.exit(1);
  }

  const user = found.rows[0];

  if (args.check) {
    console.log(`${user.email} (${user.id}) platform_admin = ${user.platform_admin}`);
    process.exit(0);
  }

  const next = !args.revoke;
  await pool.query('UPDATE users SET platform_admin = $2, updated_at = now() WHERE id = $1', [
    user.id,
    next,
  ]);
  console.log(`platform_admin=${next} set for ${user.email} (${user.id})`);
  process.exit(0);
} catch (error) {
  console.error('Failed:', error);
  process.exit(1);
} finally {
  await pool.end();
}
