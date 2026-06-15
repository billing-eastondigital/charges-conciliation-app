-- Migration 20260615000001 — Fix duplicate IMPORT rows for ADS_REVENUE/ADS_COST clients
--
-- Problem: generate_ads_billing() inserts ADS_REVENUE/ADS_COST rows but never removed
-- IMPORT rows uploaded via xlsx for the same (period_label, stripe_id).
-- The reconciler sums both, inflating expected_amount.
--
-- This migration deletes the stale IMPORT rows in any period where an ADS row already
-- exists for the same (period_label, stripe_id). The function fix is in migration 20260615000002.

DELETE FROM expected_charges
WHERE source = 'IMPORT'
  AND (period_label, stripe_id) IN (
    SELECT period_label, stripe_id
    FROM expected_charges
    WHERE source IN ('ADS_REVENUE', 'ADS_COST')
  );

-- DOWN:
-- Cannot be reversed automatically — IMPORT rows were deleted.
-- Restore from a backup or re-upload the billing xlsx for affected periods.
