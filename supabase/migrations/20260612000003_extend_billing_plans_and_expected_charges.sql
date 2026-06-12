-- ============================================================
-- Migration 20260612000003 — extend billing_plans + expected_charges
--
-- 1. Adds ADS_REVENUE / ADS_COST to the billing_method enum on client_billing_plans
-- 2. Adds billing_day_one, billing_day_two, base_fee, billing_percentage to client_billing_plans
-- 3. Adds source and billing_detail to expected_charges
-- 4. Refreshes client_active_plans view to expose new columns
--
-- See ADR 0005.
-- ============================================================

-- ── 1. client_billing_plans: extend billing_method check ──────────────────

ALTER TABLE client_billing_plans
  DROP CONSTRAINT IF EXISTS client_billing_plans_billing_method_check;

ALTER TABLE client_billing_plans
  ADD CONSTRAINT client_billing_plans_billing_method_check
    CHECK (billing_method IN ('AD_SPEND', 'SUBSCRIPTION', 'ADS_REVENUE', 'ADS_COST'));

-- ── 2. client_billing_plans: new columns ──────────────────────────────────

ALTER TABLE client_billing_plans
  ADD COLUMN billing_day_one   smallint     CHECK (billing_day_one BETWEEN 1 AND 31),
  ADD COLUMN billing_day_two   smallint     CHECK (billing_day_two BETWEEN 1 AND 31),
  ADD COLUMN base_fee          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN billing_percentage numeric(5,4) NOT NULL DEFAULT 0
                                 CHECK (billing_percentage >= 0 AND billing_percentage <= 1);

COMMENT ON COLUMN client_billing_plans.billing_method IS
  'AD_SPEND: expected charge from billing xlsx. SUBSCRIPTION: flat fee from projection_amount. ADS_REVENUE: base_fee + (conversion_value * billing_percentage). ADS_COST: base_fee + (cost_usd * billing_percentage).';

COMMENT ON COLUMN client_billing_plans.billing_day_one IS
  'Day of month Google charges the client card. Informational only in v1 — does not affect period attribution.';

COMMENT ON COLUMN client_billing_plans.billing_day_two IS
  'Estimated settlement window (~billing_day_one + 3 days). Used to confirm charge appeared in Stripe within expected window.';

COMMENT ON COLUMN client_billing_plans.base_fee IS
  'Fixed monthly base fee in USD, charged regardless of ad spend. Applied for ADS_REVENUE and ADS_COST billing methods.';

COMMENT ON COLUMN client_billing_plans.billing_percentage IS
  'Fraction of ad spend (cost or revenue) charged as management fee. Stored as decimal: 0.15 = 15%. Applied for ADS_REVENUE and ADS_COST billing methods.';

-- ── 3. expected_charges: source + billing_detail ──────────────────────────

ALTER TABLE expected_charges
  ADD COLUMN source         text  NOT NULL DEFAULT 'IMPORT'
                              CHECK (source IN ('IMPORT', 'SUBSCRIPTION', 'ADS_REVENUE', 'ADS_COST')),
  ADD COLUMN billing_detail jsonb NOT NULL DEFAULT '{}';

-- Back-fill existing SUBSCRIPTION rows
UPDATE expected_charges ec
SET source = 'SUBSCRIPTION'
FROM reconciliation_results rr
JOIN clients c ON c.stripe_id = rr.cus_id
JOIN client_billing_plans bp ON bp.client_id = c.id
  AND bp.billing_method = 'SUBSCRIPTION'
  AND bp.effective_from <= (SELECT start_date FROM periods WHERE period_label = ec.period_label)
  AND (bp.effective_to IS NULL OR bp.effective_to > (SELECT start_date FROM periods WHERE period_label = ec.period_label))
WHERE ec.stripe_id = rr.cus_id
  AND ec.period_label = rr.period_label;

COMMENT ON COLUMN expected_charges.source IS
  'How this expected charge row was generated: IMPORT (xlsx upload), SUBSCRIPTION (auto from projection_amount), ADS_REVENUE, ADS_COST.';

COMMENT ON COLUMN expected_charges.billing_detail IS
  'Auditable breakdown for computed charges. Example: {"base_fee": 500, "ad_spend": 12000, "billing_pct": 0.15, "computed_fee": 2300}. Empty for IMPORT rows.';

-- ── 4. Refresh client_active_plans view ───────────────────────────────────
-- Drop and recreate so new columns (billing_day_one, etc.) are visible.

DROP VIEW IF EXISTS client_active_plans;

CREATE VIEW client_active_plans AS
SELECT DISTINCT ON (client_id)
  bp.*,
  c.stripe_id,
  c.display_name,
  c.primary_email,
  c.batch,
  c.is_active,
  c.deactivated_month
FROM client_billing_plans bp
JOIN clients c ON c.id = bp.client_id
WHERE bp.effective_from <= current_date
  AND (bp.effective_to IS NULL OR bp.effective_to > current_date)
ORDER BY client_id, bp.effective_from DESC;

COMMENT ON VIEW client_active_plans IS
  'One row per client: the billing plan currently in effect. Joins clients for convenience. Includes billing_day_one, billing_day_two, base_fee, billing_percentage. See ADR 0005.';

-- DOWN:
-- ALTER TABLE expected_charges DROP COLUMN billing_detail, DROP COLUMN source;
-- ALTER TABLE client_billing_plans DROP COLUMN billing_percentage, DROP COLUMN base_fee, DROP COLUMN billing_day_two, DROP COLUMN billing_day_one;
-- ALTER TABLE client_billing_plans DROP CONSTRAINT client_billing_plans_billing_method_check;
-- ALTER TABLE client_billing_plans ADD CONSTRAINT client_billing_plans_billing_method_check CHECK (billing_method IN ('AD_SPEND','SUBSCRIPTION'));
