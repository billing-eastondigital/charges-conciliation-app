-- Remove IMPORT rows for LOST clients whose deactivated_month is strictly before
-- the billing period. A client churning IN the period keeps their final-month row
-- (the simplyinspiredgoods.com case — MATCH on last payment is intentional).
DELETE FROM expected_charges ec
USING clients c, periods p
WHERE ec.stripe_id = c.stripe_id
  AND ec.period_label = p.period_label
  AND ec.source = 'IMPORT'
  AND c.account_status = 'LOST'
  AND c.deactivated_month IS NOT NULL
  AND c.deactivated_month < to_char(p.start_date, 'YYYY-MM')
  AND p.is_closed = false;

-- DOWN: no clean inverse — rows came from a stale xlsx upload, not auto-generated
