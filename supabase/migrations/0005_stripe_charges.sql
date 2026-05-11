-- ============================================================
-- Migration 0005 — stripe_charges table
-- ============================================================

CREATE TABLE stripe_charges (
  charge_id       text        PRIMARY KEY,
  period_label    text        NOT NULL REFERENCES periods(period_label) ON DELETE CASCADE,
  stripe_id       text        REFERENCES clients(stripe_id) ON DELETE SET NULL,

  customer_email  text,
  description     text,
  amount          numeric(12,2) NOT NULL,
  currency        text        NOT NULL DEFAULT 'usd',
  created_at_stripe timestamptz NOT NULL,

  charge_status   text        NOT NULL
                              CHECK (charge_status IN ('PAID_NET','FAILED_RETRY','FAILED_HARD','REFUNDED')),

  amount_refunded numeric(12,2) NOT NULL DEFAULT 0,
  refunded_at     timestamptz,

  raw_stripe_status text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stripe_charges_period_label_idx  ON stripe_charges (period_label);
CREATE INDEX stripe_charges_stripe_id_idx     ON stripe_charges (stripe_id) WHERE stripe_id IS NOT NULL;
CREATE INDEX stripe_charges_period_stripe_idx ON stripe_charges (period_label, stripe_id);
CREATE INDEX stripe_charges_charge_status_idx ON stripe_charges (charge_status);
CREATE INDEX stripe_charges_created_at_idx    ON stripe_charges (created_at_stripe);

ALTER TABLE stripe_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_stripe_charges"
  ON stripe_charges FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_stripe_charges"
  ON stripe_charges FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  stripe_charges                   IS 'One row per Stripe transaction. charge_status is engine-classified, not raw Stripe status.';
COMMENT ON COLUMN stripe_charges.charge_status     IS 'PAID_NET: collected. FAILED_RETRY: failed but retried/recovered. FAILED_HARD: final failure. REFUNDED: reversed.';
COMMENT ON COLUMN stripe_charges.created_at_stripe IS 'charge.created from Stripe. Used for period attribution (current rule: falls within period [start, end]).';
COMMENT ON COLUMN stripe_charges.raw_stripe_status IS 'Original status string from the Stripe export. Preserved for audit — never overwrite.';

-- DOWN:
-- DROP TABLE stripe_charges;
