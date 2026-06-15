-- Migration 20260615000002 — Update generate_ads_billing to also delete IMPORT rows
--
-- When generate_ads_billing() runs for a period, it now deletes any IMPORT rows
-- for the same ADS stripe_ids before inserting ADS_REVENUE/ADS_COST rows.
-- This prevents billing duplication when a client's xlsx row was imported before
-- the Google Ads pipeline was live.
--
-- Also fixes a GET DIAGNOSTICS compound-expression bug from migration 20260612000007
-- (v_rows_inserted = v_rows_inserted + ROW_COUNT is invalid; must use a temp variable).

CREATE OR REPLACE FUNCTION generate_ads_billing(p_period_label text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  shopping_exclusions text[] := ARRAY[
    'ED | Shopping | Brand',
    'ED | Shopping | All Products | Brand',
    'ED | Performance Max | Brand Batch 2'
  ];

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

  v_period          periods%ROWTYPE;
  v_rows_deleted    integer := 0;
  v_rows_inserted   integer := 0;
  v_inserted_now    integer := 0;
  v_errors          jsonb   := '[]'::jsonb;

  rec RECORD;
BEGIN
  SELECT * INTO v_period FROM periods WHERE period_label = p_period_label;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period "%" not found', p_period_label;
  END IF;
  IF v_period.is_closed THEN
    RAISE EXCEPTION 'Period "%" is closed — cannot regenerate billing', p_period_label;
  END IF;

  -- Delete existing ADS rows (idempotent re-run)
  DELETE FROM expected_charges
  WHERE period_label = p_period_label
    AND source IN ('ADS_REVENUE', 'ADS_COST');

  -- Delete IMPORT rows for ADS clients — ADS billing supersedes xlsx import for these clients
  DELETE FROM expected_charges
  WHERE period_label = p_period_label
    AND source = 'IMPORT'
    AND stripe_id IN (
      SELECT cap.stripe_id
      FROM client_active_plans cap
      JOIN client_platform_ids cpi ON cpi.stripe_id = cap.stripe_id
      WHERE cap.billing_method IN ('ADS_REVENUE', 'ADS_COST')
        AND cpi.google_ads_customer_id IS NOT NULL
        AND cap.is_active = true
    );

  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

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
      WITH spend AS (
        SELECT
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
          SUM(conversion_value) AS gross_revenue,
          SUM(cost_usd)         AS gross_cost,
          COUNT(*)              AS campaign_count
        FROM google_ads_spend
        WHERE period_label           = p_period_label
          AND google_ads_customer_id = rec.google_ads_customer_id
      )
      INSERT INTO expected_charges (
        period_label, stripe_id, account_name, expected_amount, source, billing_detail
      )
      SELECT
        p_period_label,
        rec.stripe_id,
        rec.display_name,
        ROUND(
          rec.base_fee + (
            CASE rec.billing_method
              WHEN 'ADS_REVENUE' THEN (s.shopping_revenue + s.search_revenue)
              WHEN 'ADS_COST'    THEN (s.shopping_cost    + s.search_cost)
            END
          ) * rec.billing_percentage,
          4
        ),
        rec.billing_method,
        jsonb_build_object(
          'base_fee',           rec.base_fee,
          'billing_pct',        rec.billing_percentage,
          'billing_method',     rec.billing_method,
          'google_customer_id', rec.google_ads_customer_id,
          'shopping_revenue',   s.shopping_revenue,
          'shopping_cost',      s.shopping_cost,
          'search_revenue',     s.search_revenue,
          'search_cost',        s.search_cost,
          'ads_base',           CASE rec.billing_method
                                  WHEN 'ADS_REVENUE' THEN (s.shopping_revenue + s.search_revenue)
                                  WHEN 'ADS_COST'    THEN (s.shopping_cost    + s.search_cost)
                                END,
          'gross_revenue',      s.gross_revenue,
          'gross_cost',         s.gross_cost,
          'campaign_count',     s.campaign_count
        )
      FROM spend s;

      GET DIAGNOSTICS v_inserted_now = ROW_COUNT;
      v_rows_inserted := v_rows_inserted + v_inserted_now;

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

GRANT EXECUTE ON FUNCTION generate_ads_billing(text) TO anon;

-- DOWN:
-- Revert to version that only deletes ADS_REVENUE/ADS_COST rows (not IMPORT rows).
-- See migration 20260612000007 for the original function body.
