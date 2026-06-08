-- Recreate client_active_plans view to include billing_method column.
--
-- The original view was created with `bp.*` before the billing_method column
-- was added in 20260605000001. Postgres expands * at view-creation time, so
-- the column was missing and the reconcile-period auto-subscription logic
-- (.eq("billing_method", "SUBSCRIPTION")) returned no rows.
--
-- Must DROP and recreate (not CREATE OR REPLACE) because bp.* now includes
-- billing_method which shifts column positions — Postgres rejects renaming
-- existing view columns via CREATE OR REPLACE.

DROP VIEW IF EXISTS client_active_plans;

CREATE VIEW client_active_plans AS
SELECT DISTINCT ON (bp.client_id)
  bp.id,
  bp.client_id,
  bp.billing_plan,
  bp.billing_details,
  bp.billing_pct,
  bp.billing_day,
  bp.notes,
  bp.projection_type,
  bp.projection_amount,
  bp.manual_overrides,
  bp.effective_from,
  bp.effective_to,
  bp.created_at,
  bp.created_by,
  bp.billing_method,
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
ORDER BY bp.client_id, bp.effective_from DESC;

COMMENT ON VIEW client_active_plans IS
  'One row per client: the billing plan currently in effect. Joins clients for convenience. Includes billing_method.';

-- DOWN
-- DROP VIEW client_active_plans;
-- (then re-create from 0002_billing_plans.sql without billing_method)
