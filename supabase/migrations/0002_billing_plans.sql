-- ============================================================
-- Migration 0002 — client_billing_plans table
--
-- Stores the full billing plan history for each client.
-- A client can have multiple plans over time but only ONE is active at
-- any given date:
--
--   active plan = effective_from <= :date < effective_to
--                 (effective_to IS NULL for the currently open plan)
--
-- When a plan changes:
--   1. Close the current plan: UPDATE SET effective_to = :change_date
--   2. Insert new plan:        INSERT (effective_from = :change_date, effective_to = NULL)
--
-- The DB-level exclusion constraint (btree_gist) prevents any two plans
-- for the same client from overlapping in time — no silent data corruption.
--
-- Projection rules are stored per-plan, not per-client, so that if a client
-- switches from FIXED $475 to ROLLING_3 (percentage billing), historical
-- budget projections remain accurate for past months.
-- ============================================================

-- Required for the exclusion constraint on daterange
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE client_billing_plans (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Plan details
  billing_plan      text        NOT NULL,      -- e.g. "Google Shopping Starter Plan"
  billing_details   text,                      -- full pricing description
  billing_pct       numeric(5,2) NOT NULL DEFAULT 0,  -- % of ad revenue charged on top of base fee
  billing_day       smallint    CHECK (billing_day BETWEEN 1 AND 31),
  notes             text,                      -- operational notes for the billing team

  -- Projection rule for this plan period
  -- Stored here so the budget engine projects correctly for each month,
  -- even after a client switches plan types.
  projection_type   text        NOT NULL DEFAULT 'FIXED'
                                CHECK (projection_type IN ('FIXED','LAST_PERIOD','ROLLING_3','ROLLING_6','MANUAL')),
  projection_amount numeric(12,2),             -- base amount (FIXED/MANUAL fallback)
  manual_overrides  jsonb       NOT NULL DEFAULT '{}',  -- "YYYY-MM" -> amount (MANUAL type)

  -- Temporal range
  effective_from    date        NOT NULL,      -- first day this plan is in effect
  effective_to      date,                      -- first day AFTER this plan ends (null = still active)

  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text,                      -- user who configured this plan change

  -- ── Integrity constraint ──────────────────────────────────────────────
  -- No two plans for the same client can overlap in time.
  -- Uses a half-open interval [effective_from, effective_to) so that the
  -- end date of one plan and the start date of the next can be the same day.
  CONSTRAINT no_overlapping_plans EXCLUDE USING gist (
    client_id WITH =,
    daterange(
      effective_from,
      COALESCE(effective_to, '9999-12-31'::date),
      '[)'
    ) WITH &&
  )
);

-- Indexes
CREATE INDEX billing_plans_client_id_idx      ON client_billing_plans (client_id);
CREATE INDEX billing_plans_effective_from_idx ON client_billing_plans (effective_from);

-- ── Views ──────────────────────────────────────────────────────────────────

-- Convenience view: one row per client showing the currently active plan
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
  'One row per client: the billing plan currently in effect. Joins clients for convenience.';

-- ── Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE client_billing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_billing_plans"
  ON client_billing_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_billing_plans"
  ON client_billing_plans FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Comments ───────────────────────────────────────────────────────────────
COMMENT ON TABLE  client_billing_plans                  IS 'Full billing plan history per client. One active plan at a time, enforced by exclusion constraint.';
COMMENT ON COLUMN client_billing_plans.billing_pct      IS 'Percentage of ad revenue charged on top of base fee. 0 = flat rate only.';
COMMENT ON COLUMN client_billing_plans.projection_type  IS 'FIXED: same every month. LAST_PERIOD: use last actual. ROLLING_3/6: rolling average. MANUAL: per-month overrides.';
COMMENT ON COLUMN client_billing_plans.manual_overrides IS 'JSONB "YYYY-MM" -> amount for MANUAL projection type. Handles setup fees, one-off months.';
COMMENT ON COLUMN client_billing_plans.effective_from   IS 'First day this plan is in effect (inclusive). ISO date.';
COMMENT ON COLUMN client_billing_plans.effective_to     IS 'First day AFTER this plan ends (exclusive). NULL = currently active. Same as next plan effective_from.';
COMMENT ON COLUMN client_billing_plans.created_by       IS 'Email of admin user who recorded this plan change. Audit trail.';
