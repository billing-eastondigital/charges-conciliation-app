-- Migration 20260615000004 — generate_ads_billing v3
--
-- Extends billing_detail jsonb with:
--   bing_revenue, bing_percent  — placeholder (0) until Bing API integrated
--   dfw                         — DataFeed Watch amount, placeholder (0)
--   date_from, date_to          — billing window (derived from period start/end)
--   memo                        — "{Client} {Month} Invoice"
--   line_items                  — array of {text, amount} ready for Stripe invoice lines
--
-- Line item format mirrors the legacy billing app (2024-Grid view / Report_2026 structure):
--   item1: plan label + base fee
--   item2: shopping revenue/cost line with date range
--   item3: search revenue/cost line with date range
--   item4: bing line (omitted when 0)
--   item5: DFW line (omitted when 0)

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
  v_date_range      text;     -- "MM-DD - MM-DD" for line item texts
  v_pct_label       text;     -- e.g. "2%" for line item texts
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

  -- Precompute shared display values
  v_date_range := to_char(v_period.start_date, 'MM-DD') || ' - ' || to_char(v_period.end_date, 'MM-DD');

  -- Delete existing ADS rows (idempotent re-run)
  DELETE FROM expected_charges
  WHERE period_label = p_period_label
    AND source IN ('ADS_REVENUE', 'ADS_COST');

  -- Delete IMPORT rows for ADS clients — ADS billing supersedes xlsx import
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
      -- Percentage label: strip trailing zeros (0.02 → "2%", 0.025 → "2.5%")
      v_pct_label := TRIM(TO_CHAR(rec.billing_percentage * 100, 'FM999990.99')) || '%';

      WITH spend AS (
        SELECT
          -- Shopping bucket: Display(3) + Shopping(4) + Video(6) + PMax(10), minus brand exclusions
          SUM(CASE WHEN channel_type IN (3,4,6,10) AND NOT (campaign_name = ANY(shopping_exclusions))
            THEN conversion_value ELSE 0 END) AS shopping_revenue,
          SUM(CASE WHEN channel_type IN (3,4,6,10) AND NOT (campaign_name = ANY(shopping_exclusions))
            THEN cost_usd ELSE 0 END) AS shopping_cost,

          -- Search bucket: Search(2) only, minus brand exclusions
          SUM(CASE WHEN channel_type = 2 AND NOT (campaign_name = ANY(search_exclusions))
            THEN conversion_value ELSE 0 END) AS search_revenue,
          SUM(CASE WHEN channel_type = 2 AND NOT (campaign_name = ANY(search_exclusions))
            THEN cost_usd ELSE 0 END) AS search_cost,

          -- Raw totals for audit trail
          SUM(conversion_value) AS gross_revenue,
          SUM(cost_usd)         AS gross_cost,
          COUNT(*)              AS campaign_count
        FROM google_ads_spend
        WHERE period_label           = p_period_label
          AND google_ads_customer_id = rec.google_ads_customer_id
      ),
      calc AS (
        SELECT
          s.*,
          -- Billing bases (method-dependent)
          CASE rec.billing_method
            WHEN 'ADS_REVENUE' THEN s.shopping_revenue
            WHEN 'ADS_COST'    THEN s.shopping_cost
          END AS shopping_base,
          CASE rec.billing_method
            WHEN 'ADS_REVENUE' THEN s.search_revenue
            WHEN 'ADS_COST'    THEN s.search_cost
          END AS search_base
        FROM spend s
      )
      INSERT INTO expected_charges (
        period_label, stripe_id, account_name, expected_amount, source, billing_detail
      )
      SELECT
        p_period_label,
        rec.stripe_id,
        rec.display_name,
        -- total_bill = base_fee + (shopping_base + search_base) * billing_percentage
        ROUND(rec.base_fee + (c.shopping_base + c.search_base) * rec.billing_percentage, 4),
        rec.billing_method,
        jsonb_build_object(
          -- Numeric data (existing fields)
          'base_fee',           rec.base_fee,
          'billing_pct',        rec.billing_percentage,
          'billing_method',     rec.billing_method,
          'google_customer_id', rec.google_ads_customer_id,
          'shopping_revenue',   c.shopping_revenue,
          'shopping_cost',      c.shopping_cost,
          'search_revenue',     c.search_revenue,
          'search_cost',        c.search_cost,
          'ads_base',           c.shopping_base + c.search_base,
          'gross_revenue',      c.gross_revenue,
          'gross_cost',         c.gross_cost,
          'campaign_count',     c.campaign_count,
          -- Bing (placeholder until Bing API integrated)
          'bing_revenue',       0,
          'bing_percent',       0,
          -- DFW (placeholder until DataFeedWatch integrated)
          'dfw',                0,
          -- Billing window
          'date_from',          v_period.start_date,
          'date_to',            v_period.end_date,
          -- Memo for Stripe invoice
          'memo',               rec.display_name || ' ' || split_part(p_period_label, ' ', 1) || ' Invoice',
          -- Line items: formatted exactly as Stripe invoice lines
          'line_items',         (
            SELECT jsonb_agg(item ORDER BY ord)
            FROM (
              VALUES
                -- item 1: plan label + base fee
                (1, jsonb_build_object(
                  'text',
                  CASE WHEN c.search_base > 0.005
                    THEN 'Google Shopping + Text Ads $' || rec.base_fee::int::text || ' + ' || v_pct_label || ' of add revenue'
                    ELSE 'Google Shopping $'            || rec.base_fee::int::text || ' + ' || v_pct_label || ' of add revenue'
                  END,
                  'amount', rec.base_fee
                )),
                -- item 2: shopping line
                (2, jsonb_build_object(
                  'text',
                  v_pct_label || ' of revenue from Google Shopping advertising (not including Brand) Revenue ' ||
                  v_date_range || ' = $' || ROUND(c.shopping_base, 2)::text,
                  'amount', ROUND(c.shopping_base * rec.billing_percentage, 2)
                )),
                -- item 3: search line
                (3, jsonb_build_object(
                  'text',
                  v_pct_label || ' of revenue from Google Text Ads advertising (not including Brand) Revenue ' ||
                  v_date_range || ' = $' || ROUND(c.search_base, 2)::text,
                  'amount', ROUND(c.search_base * rec.billing_percentage, 2)
                ))
            ) AS t(ord, item)
            -- Bing (item 4) and DFW (item 5) omitted when 0 — added here when those integrations land
          )
        )
      FROM calc c;

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
-- Revert to v2 (migration 20260615000002) — removes extended billing_detail fields.
