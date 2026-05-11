-- ============================================================
-- Migration 0006 — reconciliation_results table
-- ============================================================

CREATE TABLE reconciliation_results (
  id              bigserial   PRIMARY KEY,
  period_label    text        NOT NULL REFERENCES periods(period_label) ON DELETE CASCADE,
  stripe_id       text        REFERENCES clients(stripe_id) ON DELETE SET NULL,

  expected_amount  numeric(12,4) NOT NULL DEFAULT 0,
  collected_amount numeric(12,2) NOT NULL DEFAULT 0,
  variance         numeric(12,4) NOT NULL DEFAULT 0,

  recon_status    text        NOT NULL
                              CHECK (recon_status IN (
                                'MATCH',
                                'OVERPAID',
                                'UNDERPAID',
                                'MISSING_PAYMENT',
                                'STRIPE_ONLY',
                                'FAILED_HARD',
                                'REFUNDED'
                              )),

  display_name    text,
  primary_email   text,
  batch           text,
  account_status  text,

  paid_net_count  integer     NOT NULL DEFAULT 0,
  failed_count    integer     NOT NULL DEFAULT 0,
  refunded_count  integer     NOT NULL DEFAULT 0,

  run_id          bigint,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reconciliation_results_period_stripe_unique UNIQUE (period_label, stripe_id)
);

CREATE INDEX recon_results_period_label_idx  ON reconciliation_results (period_label);
CREATE INDEX recon_results_stripe_id_idx     ON reconciliation_results (stripe_id) WHERE stripe_id IS NOT NULL;
CREATE INDEX recon_results_recon_status_idx  ON reconciliation_results (recon_status);
CREATE INDEX recon_results_period_status_idx ON reconciliation_results (period_label, recon_status);

CREATE TRIGGER recon_results_updated_at
  BEFORE UPDATE ON reconciliation_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_recon_results"
  ON reconciliation_results FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_recon_results"
  ON reconciliation_results FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  reconciliation_results              IS 'Engine output. One row per (period, stripe_id). Dashboard reads here. Never written by the app.';
COMMENT ON COLUMN reconciliation_results.variance     IS 'collected_amount - expected_amount. Positive = overpaid, negative = underpaid. MATCH = within ±$0.01.';
COMMENT ON COLUMN reconciliation_results.recon_status IS 'MATCH: within tolerance. OVERPAID/UNDERPAID: outside ±$0.01. MISSING_PAYMENT: AR line no Stripe. STRIPE_ONLY: Stripe no AR. FAILED_HARD/REFUNDED: no AR line.';

-- DOWN:
-- DROP TABLE reconciliation_results;
