-- ============================================================
-- Migration 20260601000003 — drop FK on stripe_charges.stripe_id
--
-- stripe_charges is imported from an external system. Charges can
-- arrive for customers not yet in the clients master (they surface
-- as STRIPE_ONLY exceptions in reconciliation). The FK was too
-- restrictive and blocked ingestion of new customers.
-- ============================================================

ALTER TABLE stripe_charges DROP CONSTRAINT IF EXISTS stripe_charges_stripe_id_fkey;

-- DOWN:
-- ALTER TABLE stripe_charges ADD CONSTRAINT stripe_charges_stripe_id_fkey
--   FOREIGN KEY (stripe_id) REFERENCES clients(stripe_id) ON DELETE SET NULL;
