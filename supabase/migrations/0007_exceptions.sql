-- ============================================================
-- Migration 0007 — exceptions table
-- ============================================================

CREATE TABLE exceptions (
  id              bigserial   PRIMARY KEY,
  period_label    text        NOT NULL REFERENCES periods(period_label) ON DELETE CASCADE,
  stripe_id       text        REFERENCES clients(stripe_id) ON DELETE SET NULL,

  result_id       bigint      REFERENCES reconciliation_results(id) ON DELETE SET NULL,

  exception_type  text        NOT NULL
                              CHECK (exception_type IN (
                                'OVERPAID',
                                'UNDERPAID',
                                'MISSING_PAYMENT',
                                'STRIPE_ONLY',
                                'FAILED_HARD',
                                'REFUNDED'
                              )),

  expected_amount  numeric(12,4),
  collected_amount numeric(12,2),
  variance         numeric(12,4),

  display_name    text,
  primary_email   text,
  batch           text,

  resolution_status text      NOT NULL DEFAULT 'OPEN'
                              CHECK (resolution_status IN ('OPEN','RESOLVED','WONT_FIX','ESCALATED')),
  resolution_note text,
  resolved_by     text,
  resolved_at     timestamptz,

  client_contacted_at timestamptz,
  outreach_channel    text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exceptions_period_label_idx      ON exceptions (period_label);
CREATE INDEX exceptions_stripe_id_idx         ON exceptions (stripe_id) WHERE stripe_id IS NOT NULL;
CREATE INDEX exceptions_resolution_status_idx ON exceptions (resolution_status);
CREATE INDEX exceptions_exception_type_idx    ON exceptions (exception_type);
CREATE INDEX exceptions_open_queue_idx        ON exceptions (period_label, resolution_status) WHERE resolution_status = 'OPEN';

CREATE TRIGGER exceptions_updated_at
  BEFORE UPDATE ON exceptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_exceptions"
  ON exceptions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_write_exceptions"
  ON exceptions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_exceptions"
  ON exceptions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "service_write_exceptions"
  ON exceptions FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  exceptions                   IS 'Workflow queue for non-MATCH reconciliation results. Auto-created by engine, resolved manually.';
COMMENT ON COLUMN exceptions.resolution_status IS 'OPEN: needs action. RESOLVED: explained and closed. WONT_FIX: accepted discrepancy. ESCALATED: needs owner attention.';
COMMENT ON COLUMN exceptions.variance          IS 'Snapshot of variance at exception creation. Does not update if the underlying result changes.';

-- DOWN:
-- DROP TABLE exceptions;
