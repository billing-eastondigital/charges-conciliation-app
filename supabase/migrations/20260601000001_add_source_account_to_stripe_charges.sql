-- ============================================================
-- Migration 20260601000001 — add source_account to stripe_charges
--
-- Tracks which Stripe account a charge came from.
-- NULL = loaded before this migration (CSV import).
-- ============================================================

ALTER TABLE stripe_charges
  ADD COLUMN source_account text
    CHECK (source_account IN ('main', 'launch'));

CREATE INDEX stripe_charges_source_account_idx
  ON stripe_charges (source_account)
  WHERE source_account IS NOT NULL;

COMMENT ON COLUMN stripe_charges.source_account IS
  'Stripe account that produced this charge: main or launch. NULL for rows loaded before this migration.';

-- DOWN:
-- DROP INDEX stripe_charges_source_account_idx;
-- ALTER TABLE stripe_charges DROP COLUMN source_account;
