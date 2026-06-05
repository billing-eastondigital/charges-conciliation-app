-- Add billing_method to client_billing_plans
--
-- AD_SPEND (default): expected charge comes from the billing xlsx uploaded each month.
-- SUBSCRIPTION: flat fee auto-generated from projection_amount at reconcile time —
--               no manual import needed each period.
--
ALTER TABLE client_billing_plans
  ADD COLUMN billing_method text NOT NULL DEFAULT 'AD_SPEND'
    CHECK (billing_method IN ('AD_SPEND', 'SUBSCRIPTION'));

-- Back-fill existing SUBSCRIPTION batch clients
UPDATE client_billing_plans bp
SET    billing_method = 'SUBSCRIPTION'
FROM   clients c
WHERE  c.id    = bp.client_id
  AND  c.batch = 'SUBSCRIPTION';

COMMENT ON COLUMN client_billing_plans.billing_method IS
  'AD_SPEND: expected charge imported from billing xlsx each period. SUBSCRIPTION: flat fee auto-generated from projection_amount at reconcile time.';

-- DOWN
-- ALTER TABLE client_billing_plans DROP COLUMN billing_method;
