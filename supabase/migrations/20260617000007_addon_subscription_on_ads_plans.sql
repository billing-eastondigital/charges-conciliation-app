-- Add optional subscription add-on fields to ADS billing plans.
-- When addon_subscription_amount > 0, reconcile-period generates a second
-- SUBSCRIPTION expected_charges row alongside the ADS row for the same stripe_id.
-- The reconciler sums both rows — no double-counting since they represent
-- two separately-billed services (e.g. Google Ads fee + Amazon Services $475).
ALTER TABLE client_billing_plans
  ADD COLUMN IF NOT EXISTS addon_subscription_amount numeric(12,4),
  ADD COLUMN IF NOT EXISTS addon_subscription_label  text;

COMMENT ON COLUMN client_billing_plans.addon_subscription_amount IS
  'Optional flat subscription add-on for ADS clients billed separately (e.g. Amazon Services). When set, reconcile-period generates an extra SUBSCRIPTION row for this amount alongside the ADS row.';

-- DOWN:
-- ALTER TABLE client_billing_plans DROP COLUMN addon_subscription_amount, DROP COLUMN addon_subscription_label;
