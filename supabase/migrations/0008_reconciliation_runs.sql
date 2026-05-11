-- ============================================================
-- Migration 0008 — reconciliation_runs table
-- ============================================================

CREATE TABLE reconciliation_runs (
  id              bigserial   PRIMARY KEY,
  period_label    text        NOT NULL REFERENCES periods(period_label) ON DELETE CASCADE,

  engine_version  text        NOT NULL,
  run_at          timestamptz NOT NULL DEFAULT now(),
  triggered_by    text,

  billing_file_name   text    NOT NULL,
  billing_file_hash   text    NOT NULL,
  stripe_file_name    text    NOT NULL,
  stripe_file_hash    text    NOT NULL,

  total_expected    numeric(12,4),
  total_collected   numeric(12,2),
  total_variance    numeric(12,4),

  match_count         integer NOT NULL DEFAULT 0,
  overpaid_count      integer NOT NULL DEFAULT 0,
  underpaid_count     integer NOT NULL DEFAULT 0,
  missing_count       integer NOT NULL DEFAULT 0,
  stripe_only_count   integer NOT NULL DEFAULT 0,
  failed_hard_count   integer NOT NULL DEFAULT 0,
  refunded_count      integer NOT NULL DEFAULT 0,

  run_status      text        NOT NULL DEFAULT 'COMPLETED'
                              CHECK (run_status IN ('COMPLETED','FAILED','PARTIAL')),
  error_message   text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reconciliation_results
  ADD CONSTRAINT reconciliation_results_run_id_fk
  FOREIGN KEY (run_id) REFERENCES reconciliation_runs(id) ON DELETE SET NULL;

CREATE INDEX recon_runs_period_label_idx ON reconciliation_runs (period_label);
CREATE INDEX recon_runs_run_at_idx       ON reconciliation_runs (run_at DESC);

ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_recon_runs"
  ON reconciliation_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_recon_runs"
  ON reconciliation_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  reconciliation_runs                 IS 'Provenance record per engine run. Source-file hashes ensure every report is reproducible.';
COMMENT ON COLUMN reconciliation_runs.billing_file_hash IS 'SHA-256 of the AR workbook used in this run. Must match stored file to reproduce results.';
COMMENT ON COLUMN reconciliation_runs.stripe_file_hash  IS 'SHA-256 of the Stripe CSV used in this run.';
COMMENT ON COLUMN reconciliation_runs.engine_version    IS 'Semver or git SHA of the reconciliation engine. Pinned for reproducibility.';

-- DOWN:
-- ALTER TABLE reconciliation_results DROP CONSTRAINT reconciliation_results_run_id_fk;
-- DROP TABLE reconciliation_runs;
