-- ============================================================
-- Migration 0004 — expected_charges table
--
-- One row per AR billing line from the master workbook.
-- Multiple rows may share the same (period_label, stripe_id)
-- for clients billed across multiple sub-accounts.
-- NEVER merge at ingest — drill-down requires each line visible.
-- ============================================================

CREATE TABLE expected_charges (
  id              bigserial   PRIMARY KEY,
  period_label    text        NOT NULL REFERENCES periods(period_label) ON DELETE CASCADE,
  stripe_id       text        REFERENCES clients(stripe_id) ON DELETE SET NULL,

  account_name    text        NOT NULL,
  primary_email   text,
  batch           text,

  expected_amount numeric(12,4) NOT NULL DEFAULT 0,

  google_shopping_charge  numeric(12,4),
  google_search_charge    numeric(12,4),
  bing_charge             numeric(12,4),
  base_fee                numeric(12,4),
  other_charge            numeric(12,4),

  billing_plan    text,
  billing_pct     numeric(5,2),

  source_row_index  integer,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX expected_charges_period_label_idx  ON expected_charges (period_label);
CREATE INDEX expected_charges_stripe_id_idx     ON expected_charges (stripe_id) WHERE stripe_id IS NOT NULL;
CREATE INDEX expected_charges_period_stripe_idx ON expected_charges (period_label, stripe_id);

ALTER TABLE expected_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_expected_charges"
  ON expected_charges FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_expected_charges"
  ON expected_charges FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  expected_charges                IS 'One row per AR billing line. Multiple rows per (period, stripe_id) are intentional — never merge at ingest.';
COMMENT ON COLUMN expected_charges.expected_amount IS 'Total expected amount for this AR line. 4dp to match source workbook precision.';
COMMENT ON COLUMN expected_charges.source_row_index IS 'Row index in the AR workbook. Used for debugging data quality issues.';

-- DOWN:
-- DROP TABLE expected_charges;
