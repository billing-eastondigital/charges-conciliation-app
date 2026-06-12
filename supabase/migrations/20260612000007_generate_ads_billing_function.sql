-- ============================================================
-- Migration 20260612000007 — generate_ads_billing(period_label) function
--
-- Computes expected_charges for ADS_REVENUE and ADS_COST clients
-- from google_ads_spend data, applying the exact campaign exclusion
-- rules derived from the manual billing sheet.
--
-- Billing formula:
--   total_bill = base_fee + (shopping_base + search_base) * billing_percentage
--
--   ADS_REVENUE: shopping_base/search_base = SUM(conversion_value)
--   ADS_COST:    shopping_base/search_base = SUM(cost_usd)
--
-- Shopping bucket (channel_type IN 3,4,6,10 = Display, Shopping, Video, PMax):
--   Exclude exact names:
--     'ED | Shopping | Brand'
--     'ED | Shopping | All Products | Brand'
--     'ED | Performance Max | Brand Batch 2'
--
-- Search bucket (channel_type = 2):
--   Exclude exact names: 20 brand campaign name variants (see SEARCH_BRAND_EXCLUSIONS).
--
-- Idempotent: deletes then re-inserts only rows with
--   source IN ('ADS_REVENUE','ADS_COST') for the given period.
-- Never touches IMPORT or SUBSCRIPTION rows.
--
-- See ADR 0005 and docs/roadmap-google-ads-billing.md Phase 4.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_ads_billing(p_period_label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Shopping brand exclusions (exact campaign name match)
  shopping_exclusions text[] := ARRAY[
    'ED | Shopping | Brand',
    'ED | Shopping | All Products | Brand',
    'ED | Performance Max | Brand Batch 2'
  ];

  -- Search brand exclusions (exact campaign name match)
  search_exclusions text[] := ARRAY[
    'Branded',
    'ED | Search | Wholesale Sock Deals Brand ONLY',
    'ED | Search | Brand _Real Estate Posts',
    'ED | Search - Brand',
    'ED | Search Branded',
    'ED | Search | Brand - White River',
    'ED | Search | Branded | US & CA',
    'ED | Brand',
    'ED | Search | Brand - Mouldings',
    'ED | Search | Brand KTM Twins',
    'ED | Search | Brand',
    'ED | Search | Branded',
    'ED | Search | DFO Brand',
    'ED | Search | new_Brand',
    'ED | Brand Terms',
    'ED | Search | AllTimeTrading - Brand',
    'ED | Search | Branded US',
    'ED | Search | Branded CA',
    'ED | Search | Branded | CA',
    'ED | Search - Brand (Tambour Touch)'
  ];

  v_period         periods%ROWTYPE;
  v_rows_deleted   integer := 0;
  v_rows_inserted  integer := 0;
  v_skipped        integer := 0;
  v_errors         jsonb   := '[]'::jsonb;

  -- Cursor over clients with ADS_REVENUE or ADS_COST active plans
  rec RECORD;
BEGIN
  -- Validate period
  SELECT * INTO v_period FROM periods WHERE period_label = p_period_label;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period "%" not found', p_period_label;
  END IF;
  IF v_period.is_closed THEN
    RAISE EXCEPTION 'Period "%" is closed — cannot regenerate billing', p_period_label;
  END IF;

  -- Delete existing ADS-generated expected_charges for this period
  DELETE FROM expected_charges
  WHERE period_label = p_period_label
    AND source IN ('ADS_REVENUE', 'ADS_COST');
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

  -- Loop over each ADS_REVENUE/ADS_COST client with a google_ads_customer_id
  FOR rec IN
    SELECT
      cap.stripe_id,
      cap.display_name,
      cap.billing_method,
      cap.base_fee,
      cap.billing_percentage,
      cpi.google_ads_customer_id,
      cpi.other_ids
    FROM client_active_plans cap
    JOIN client_platform_ids  cpi ON cpi.stripe_id = cap.stripe_id
    WHERE cap.billing_method IN ('ADS_REVENUE', 'ADS_COST')
      AND cpi.google_ads_customer_id IS NOT NULL
      AND cap.is_active = true
  LOOP
    BEGIN
      -- Aggregate spend for primary google_ads_customer_id
      -- (multi-account clients: secondary IDs stored in cpi.other_ids — not yet aggregated)
      WITH spend AS (
        SELECT
          -- Shopping bucket: Display(3) + Shopping(4) + Video(6) + PMax(10), minus brand exclusions
          SUM(CASE
            WHEN channel_type IN (3, 4, 6, 10)
             AND NOT (campaign_name = ANY(shopping_exclusions))
            THEN conversion_value ELSE 0
          END) AS shopping_revenue,

          SUM(CASE
            WHEN channel_type IN (3, 4, 6, 10)
             AND NOT (campaign_name = ANY(shopping_exclusions))
            THEN cost_usd ELSE 0
          END) AS shopping_cost,

          -- Search bucket: Search(2) only, minus brand exclusions
          SUM(CASE
            WHEN channel_type = 2
             AND NOT (campaign_name = ANY(search_exclusions))
            THEN conversion_value ELSE 0
          END) AS search_revenue,

          SUM(CASE
            WHEN channel_type = 2
             AND NOT (campaign_name = ANY(search_exclusions))
            THEN cost_usd ELSE 0
          END) AS search_cost,

          -- Raw totals for billing_detail audit trail
          SUM(conversion_value) AS gross_revenue,
          SUM(cost_usd)         AS gross_cost,
          COUNT(*)              AS campaign_count
        FROM google_ads_spend
        WHERE period_label           = p_period_label
          AND google_ads_customer_id = rec.google_ads_customer_id
      )
      INSERT INTO expected_charges (
        period_label,
        stripe_id,
        account_name,
        expected_amount,
        source,
        billing_detail
      )
      SELECT
        p_period_label,
        rec.stripe_id,
        rec.display_name,
        -- total_bill = base_fee + (shopping_base + search_base) * billing_percentage
        ROUND(
          rec.base_fee + (
            CASE rec.billing_method
              WHEN 'ADS_REVENUE' THEN (s.shopping_revenue + s.search_revenue)
              WHEN 'ADS_COST'    THEN (s.shopping_cost    + s.search_cost)
            END
          ) * rec.billing_percentage,
          4  -- 4dp to match expected_amount precision
        ),
        rec.billing_method,
        jsonb_build_object(
          'base_fee',         rec.base_fee,
          'billing_pct',      rec.billing_percentage,
          'billing_method',   rec.billing_method,
          'google_customer_id', rec.google_ads_customer_id,
          'shopping_revenue', s.shopping_revenue,
          'shopping_cost',    s.shopping_cost,
          'search_revenue',   s.search_revenue,
          'search_cost',      s.search_cost,
          'ads_base',         CASE rec.billing_method
                                WHEN 'ADS_REVENUE' THEN (s.shopping_revenue + s.search_revenue)
                                WHEN 'ADS_COST'    THEN (s.shopping_cost    + s.search_cost)
                              END,
          'gross_revenue',    s.gross_revenue,
          'gross_cost',       s.gross_cost,
          'campaign_count',   s.campaign_count
        )
      FROM spend s;

      GET DIAGNOSTICS v_rows_inserted = v_rows_inserted + ROW_COUNT;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'stripe_id',  rec.stripe_id,
        'google_id',  rec.google_ads_customer_id,
        'error',      SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',            jsonb_array_length(v_errors) = 0,
    'period_label',  p_period_label,
    'rows_deleted',  v_rows_deleted,
    'rows_inserted', v_rows_inserted,
    'errors',        v_errors
  );
END;
$$;

COMMENT ON FUNCTION generate_ads_billing(text) IS
  'Computes expected_charges for ADS_REVENUE/ADS_COST clients from google_ads_spend.
   Idempotent: deletes and re-inserts ADS rows only. Never touches IMPORT or SUBSCRIPTION rows.
   Shopping bucket: channel_type IN (3,4,6,10) minus 3 brand exclusions.
   Search bucket: channel_type = 2 minus 20 brand campaign exclusions.
   Formula: total_bill = base_fee + ads_base * billing_percentage.
   See ADR 0005.';

-- Anon can call this via RPC (needed for admin/import trigger button)
GRANT EXECUTE ON FUNCTION generate_ads_billing(text) TO anon;

-- DOWN:
-- DROP FUNCTION IF EXISTS generate_ads_billing(text);
