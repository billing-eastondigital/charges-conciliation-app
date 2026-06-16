-- Migration 20260616000002 — add other_ids to client_active_plans view
-- Required so ingest-google-ads can read google_ads_additional_customer_ids
-- and process all accounts for multi-account clients (e.g. cus_MAQFq6FlG4sGc3).

CREATE OR REPLACE VIEW client_active_plans AS
 SELECT DISTINCT ON (bp.client_id) bp.id,
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
    bp.billing_day_one,
    bp.billing_day_two,
    bp.base_fee,
    bp.billing_percentage,
    c.stripe_id,
    c.display_name,
    c.primary_email,
    c.batch,
    c.is_active,
    c.deactivated_month,
    cpi.google_ads_customer_id,
    cpi.other_ids
   FROM ((client_billing_plans bp
     JOIN clients c ON ((c.id = bp.client_id)))
     LEFT JOIN client_platform_ids cpi ON ((cpi.stripe_id = c.stripe_id)))
  WHERE ((bp.effective_from <= CURRENT_DATE) AND ((bp.effective_to IS NULL) OR (bp.effective_to > CURRENT_DATE)))
  ORDER BY bp.client_id, bp.effective_from DESC;

-- DOWN: remove other_ids from the SELECT list
