-- Fix generate_ads_billing: skip clients with no google_ads_spend rows for the period.
-- Previously SUM() on an empty set returns NULL → NOT NULL constraint violation on expected_amount.
-- Correct behavior: only insert an expected_charge if at least one campaign row has been ingested.
-- Also adds rows_skipped to the return payload for observability.

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

  v_period         periods%ROWTYPE;
  v_rows_deleted   integer := 0;
  v_rows_inserted  integer := 0;
  v_skipped        integer := 0;
  v_errors         jsonb   := '[]'::jsonb;

  rec   RECORD;
  spend RECORD;
BEGIN
  SELECT * INTO v_period FROM periods WHERE period_label = p_period_label;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Period "%" not found', p_period_label;
  END IF;
  IF v_period.is_closed THEN
    RAISE EXCEPTION 'Period "%" is closed — cannot regenerate billing', p_period_label;
  END IF;

  DELETE FROM expected_charges
  WHERE period_label = p_period_label
    AND source IN ('ADS_REVENUE', 'ADS_COST');
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
      -- Skip clients whose billing day hasn't triggered yet (no spend data ingested)
      IF NOT EXISTS (
        SELECT 1 FROM google_ads_spend
        WHERE period_label           = p_period_label
          AND google_ads_customer_id = rec.google_ads_customer_id
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      SELECT
        COALESCE(SUM(CASE WHEN channel_type IN (3,4,6,10) AND NOT (campaign_name = ANY(shopping_exclusions)) THEN conversion_value ELSE 0 END), 0) AS shopping_revenue,
        COALESCE(SUM(CASE WHEN channel_type IN (3,4,6,10) AND NOT (campaign_name = ANY(shopping_exclusions)) THEN cost_usd        ELSE 0 END), 0) AS shopping_cost,
        COALESCE(SUM(CASE WHEN channel_type = 2            AND NOT (campaign_name = ANY(search_exclusions))   THEN conversion_value ELSE 0 END), 0) AS search_revenue,
        COALESCE(SUM(CASE WHEN channel_type = 2            AND NOT (campaign_name = ANY(search_exclusions))   THEN cost_usd        ELSE 0 END), 0) AS search_cost,
        COALESCE(SUM(conversion_value), 0) AS gross_revenue,
        COALESCE(SUM(cost_usd), 0)         AS gross_cost,
        COUNT(*)                           AS campaign_count
      INTO spend
      FROM google_ads_spend
      WHERE period_label           = p_period_label
        AND google_ads_customer_id = rec.google_ads_customer_id;

      INSERT INTO expected_charges (
        period_label, stripe_id, account_name, expected_amount, source, billing_detail
      ) VALUES (
        p_period_label,
        rec.stripe_id,
        rec.display_name,
        ROUND(
          rec.base_fee + (
            CASE rec.billing_method
              WHEN 'ADS_REVENUE' THEN (spend.shopping_revenue + spend.search_revenue)
              WHEN 'ADS_COST'    THEN (spend.shopping_cost    + spend.search_cost)
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
          'shopping_revenue',   spend.shopping_revenue,
          'shopping_cost',      spend.shopping_cost,
          'search_revenue',     spend.search_revenue,
          'search_cost',        spend.search_cost,
          'ads_base',           CASE rec.billing_method
                                  WHEN 'ADS_REVENUE' THEN (spend.shopping_revenue + spend.search_revenue)
                                  WHEN 'ADS_COST'    THEN (spend.shopping_cost    + spend.search_cost)
                                END,
          'gross_revenue',      spend.gross_revenue,
          'gross_cost',         spend.gross_cost,
          'campaign_count',     spend.campaign_count
        )
      );

      v_rows_inserted := v_rows_inserted + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'stripe_id', rec.stripe_id,
        'google_id', rec.google_ads_customer_id,
        'error',     SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',            jsonb_array_length(v_errors) = 0,
    'period_label',  p_period_label,
    'rows_deleted',  v_rows_deleted,
    'rows_inserted', v_rows_inserted,
    'rows_skipped',  v_skipped,
    'errors',        v_errors
  );
END;
$$;

COMMENT ON FUNCTION generate_ads_billing(text) IS
  'Computes expected_charges for ADS_REVENUE/ADS_COST clients from google_ads_spend.
   Skips clients with no spend data ingested yet (billing day not reached).
   Idempotent: deletes and re-inserts ADS rows only. Never touches IMPORT or SUBSCRIPTION rows.
   Shopping bucket: channel_type IN (3,4,6,10) minus 3 brand exclusions.
   Search bucket: channel_type = 2 minus 20 brand campaign exclusions.
   Formula: total_bill = base_fee + ads_base * billing_percentage.
   See ADR 0005.';

GRANT EXECUTE ON FUNCTION generate_ads_billing(text) TO anon;

-- DOWN:
-- Restore from migration 20260612000007_generate_ads_billing_function.sql
