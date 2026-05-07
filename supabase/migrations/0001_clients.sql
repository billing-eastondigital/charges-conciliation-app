-- ============================================================
-- Migration 0001 — clients table
--
-- Stores client identity, billing batch, and lifecycle fields.
-- Billing plan configuration (amounts, rules, projection) lives in
-- the separate `client_billing_plans` table (migration 0002).
--
-- One row = one billing relationship (one Stripe customer ID).
-- Clients billed under a single cus_id for multiple sub-accounts
-- use the `accounts[]` array to list all account names.
-- stripe_id is nullable for clients invoiced manually (no Stripe account).
-- ============================================================

CREATE TABLE clients (
  -- Identity
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_id       text        UNIQUE,          -- cus_… (nullable = no Stripe account yet)
  display_name    text        NOT NULL,
  primary_email   text        NOT NULL,
  account_status  text        NOT NULL DEFAULT 'ACTIVE'
                              CHECK (account_status IN ('ACTIVE', 'LOST', 'INACTIVE')),

  -- Billing grouping
  batch           text        NOT NULL DEFAULT '—'
                              CHECK (batch IN ('1','2','3','SUBSCRIPTION','5','Consulting','Multiple','—')),
  google_id       text,                        -- internal Google Ads account ID
  accounts        text[]      NOT NULL DEFAULT '{}',  -- sub-account names under stripe_id

  -- Lifecycle
  is_active       boolean     NOT NULL DEFAULT true,
  deactivated_month text,                      -- "YYYY-MM" — budget projection stops here on churn
  start_date      date,
  end_date        date,

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX clients_stripe_id_idx      ON clients (stripe_id)    WHERE stripe_id IS NOT NULL;
CREATE INDEX clients_primary_email_idx  ON clients (primary_email);
CREATE INDEX clients_account_status_idx ON clients (account_status);
CREATE INDEX clients_batch_idx          ON clients (batch);
CREATE INDEX clients_is_active_idx      ON clients (is_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_clients"
  ON clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_clients"
  ON clients FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Comments
COMMENT ON TABLE  clients                    IS 'One row per Stripe customer ID (billing relationship). Billing plan history in client_billing_plans.';
COMMENT ON COLUMN clients.stripe_id          IS 'Stripe cus_… identifier. Nullable for clients invoiced manually without a Stripe account.';
COMMENT ON COLUMN clients.batch              IS 'Billing batch label from the AR master sheet. Used for grouping in the reconciliation and budget views.';
COMMENT ON COLUMN clients.accounts           IS 'Sub-account names billed under this stripe_id. Length > 1 = merged billing (one invoice, multiple domains).';
COMMENT ON COLUMN clients.deactivated_month  IS 'YYYY-MM format. Budget projection goes to null from this month onward when a client churns.';
