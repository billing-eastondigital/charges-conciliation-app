-- ============================================================
-- Migration 0003 — periods table
-- ============================================================

CREATE TABLE periods (
  period_label  text        PRIMARY KEY,
  start_date    date        NOT NULL,
  end_date      date        NOT NULL,
  is_closed     boolean     NOT NULL DEFAULT false,
  closed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT periods_dates_valid CHECK (start_date <= end_date)
);

CREATE INDEX periods_is_closed_idx  ON periods (is_closed);
CREATE INDEX periods_start_date_idx ON periods (start_date);

CREATE TRIGGER periods_updated_at
  BEFORE UPDATE ON periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_periods"
  ON periods FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_periods"
  ON periods FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  periods              IS 'One row per reconciliation period. period_label is the canonical FK used by all reconciliation tables.';
COMMENT ON COLUMN periods.is_closed    IS 'True once the period is finalized. Engine will refuse to re-write a closed period without explicit override.';
COMMENT ON COLUMN periods.period_label IS 'Human-readable period key, e.g. "April 2026". Used as FK across reconciliation tables.';

-- DOWN:
-- DROP TABLE periods;
