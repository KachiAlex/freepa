import { pool } from './pool';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  platform_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_uid uuid REFERENCES users(id),
  owner_email text,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text,
  role text NOT NULL,
  invited_by uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  outstanding_balance double precision NOT NULL DEFAULT 0,
  last_invoice_date text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS counters (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  current bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, name)
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number text NOT NULL,
  client_id text NOT NULL,
  client_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  issue_date text NOT NULL,
  due_date text NOT NULL,
  currency text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment jsonb,
  payment_intent jsonb,
  payment_intent_url text,
  pdf_status text,
  pdf_url text,
  pdf_updated_at timestamptz,
  receipt_pdf_status text,
  receipt_pdf_url text,
  receipt_pdf_updated_at timestamptz,
  sent_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_uid text,
  actor_email text,
  action text NOT NULL,
  target text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_user ON members (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_created ON invoices (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_pending ON invoices (status) WHERE status = 'payment_pending';
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events (created_at DESC);
`;

export async function runMigrations(): Promise<void> {
  await pool.query(SCHEMA);
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      console.log('Migrations applied.');
      await pool.end();
    })
    .catch(async (error) => {
      console.error('Migration failed', error);
      await pool.end();
      process.exit(1);
    });
}
