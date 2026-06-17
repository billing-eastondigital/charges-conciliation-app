-- Migration 20260617000005 — generate_ads_billing v10
-- Preserve manual fields (bing_revenue, bing_percent, dfw, ready_for_billing,
-- invoice_url, invoice_status) across reconciliation runs.
-- Before DELETE: snapshot those fields into v_manual_snapshot (jsonb keyed by stripe_id).
-- After INSERT: restore them via UPDATE so re-running recon never wipes manual data.

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
    'Branded','ED | Search | Wholesale Sock Deals Brand ONLY','ED | Search | Brand _Real Estate Posts',
    'ED | Search - Brand','ED | Search Branded','ED | Search | Brand - White River',
    'ED | Search | Branded | US & CA','ED | Brand','ED | Search | Brand - Mouldings',
    'ED | Search | Brand KTM Twins','ED | Search | Brand','ED | Search | Branded',
    'ED | Search | DFO Brand','ED | Search | new_Brand','ED | Brand Terms',
    'ED | Search | AllTimeTrading - Brand','ED | Search | Branded US',
    'ED | Search | Branded CA','ED | Search | Branded | CA','ED | Search - Brand (Tambour Touch)'
  ];

  v_period          periods%ROWTYPE;
  v_date_range      text;
  v_data_start      date;
  v_data_end        date;
  v_pct_label       text;
  v_rows_deleted    integer := 0;
  v_rows_inserted   integer := 0;
  v_inserted_now    integer := 0;
  v_errors          jsonb   := '[]'::jsonb;
  v_all_ids         text[];
  v_bday            integer;
  v_prev_first      date;
  v_prev_last       date;
  v_manual_snapshot jsonb   := '{}'::jsonb;
  rec RECORD;
BEGIN
  SELECT * INTO v_period FROM periods WHERE period_label = p_period_label;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period "%" not found', p_period_label; END IF;
  IF v_period.is_closed THEN RAISE EXCEPTION 'Period "%" is closed', p_period_label; END IF;

  v_prev_first := date_trunc('month', v_period.start_date) - interval '1 month';
  v_prev_last  := date_trunc('month', v_period.start_date) - interval '1 day';

  -- Snapshot manual fields before DELETE so they survive the reinsert
  SELECT COALESCE(jsonb_object_agg(
    stripe_id,
    jsonb_build_object(
      'bing_revenue',      COALESCE((billing_detail->>'bing_revenue')::numeric,  0),
      'bing_percent',      COALESCE((billing_detail->>'bing_percent')::numeric,  0),
      'dfw',               COALESCE((billing_detail->>'dfw')::numeric,            0),
      'ready_for_billing', COALESCE(ready_for_billing, false),
      'invoice_url',       invoice_url,
      'invoice_status',    invoice_status
    )
  ), '{}'::jsonb)
  INTO v_manual_snapshot
  FROM expected_charges
  WHERE period_label = p_period_label AND source IN ('ADS_REVENUE','ADS_COST');

  DELETE FROM expected_charges WHERE period_label = p_period_label AND source IN ('ADS_REVENUE','ADS_COST');
  DELETE FROM expected_charges WHERE period_label = p_period_label AND source = 'IMPORT'
    AND stripe_id IN (
      SELECT cap.stripe_id FROM client_active_plans cap
      JOIN client_platform_ids cpi ON cpi.stripe_id = cap.stripe_id
      WHERE cap.billing_method IN ('ADS_REVENUE','ADS_COST')
        AND cpi.google_ads_customer_id IS NOT NULL AND cap.is_active = true
    );
  GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

  FOR rec IN
    SELECT cap.stripe_id, cap.display_name, cap.batch, cap.billing_method,
           cap.base_fee, cap.billing_percentage, cap.billing_day_one,
           cpi.google_ads_customer_id, cpi.other_ids
    FROM client_active_plans cap
    JOIN client_platform_ids cpi ON cpi.stripe_id = cap.stripe_id
    WHERE cap.billing_method IN ('ADS_REVENUE','ADS_COST')
      AND cpi.google_ads_customer_id IS NOT NULL AND cap.is_active = true
  LOOP
    BEGIN
      v_pct_label := TRIM(TO_CHAR(rec.billing_percentage * 100, 'FM999990.99')) || '%';

      v_bday := COALESCE(rec.billing_day_one, 1);
      IF v_bday = 1 THEN
        v_data_start := v_prev_first;
        v_data_end   := v_prev_last;
      ELSE
        v_data_start := v_prev_first + (v_bday - 1) * interval '1 day';
        v_data_end   := v_period.start_date + (v_bday - 2) * interval '1 day';
      END IF;
      v_date_range := to_char(v_data_start, 'MM-DD') || ' - ' || to_char(v_data_end, 'MM-DD');

      v_all_ids := ARRAY[rec.google_ads_customer_id] ||
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(rec.other_ids->'google_ads_additional_customer_ids')),
          ARRAY[]::text[]
        );

      WITH spend AS (
        SELECT
          COALESCE(SUM(CASE
            WHEN channel_type IN (3,4,6,10)
             AND g.campaign_name ~* 'ED\s+\|'
             AND NOT (g.campaign_name = ANY(shopping_exclusions))
             AND NOT EXISTS (
               SELECT 1 FROM google_ads_campaign_overrides o
               WHERE o.period_label = p_period_label
                 AND o.google_ads_customer_id = g.google_ads_customer_id
                 AND o.campaign_id = g.campaign_id
                 AND o.excluded = true
             )
            THEN g.conversion_value ELSE 0 END), 0) AS shopping_revenue,
          COALESCE(SUM(CASE
            WHEN channel_type IN (3,4,6,10)
             AND g.campaign_name ~* 'ED\s+\|'
             AND NOT (g.campaign_name = ANY(shopping_exclusions))
             AND NOT EXISTS (
               SELECT 1 FROM google_ads_campaign_overrides o
               WHERE o.period_label = p_period_label
                 AND o.google_ads_customer_id = g.google_ads_customer_id
                 AND o.campaign_id = g.campaign_id
                 AND o.excluded = true
             )
            THEN g.cost_usd ELSE 0 END), 0) AS shopping_cost,
          COALESCE(SUM(CASE
            WHEN channel_type = 2
             AND g.campaign_name ~* 'ED\s+\|'
             AND NOT (g.campaign_name = ANY(search_exclusions))
             AND NOT EXISTS (
               SELECT 1 FROM google_ads_campaign_overrides o
               WHERE o.period_label = p_period_label
                 AND o.google_ads_customer_id = g.google_ads_customer_id
                 AND o.campaign_id = g.campaign_id
                 AND o.excluded = true
             )
            THEN g.conversion_value ELSE 0 END), 0) AS search_revenue,
          COALESCE(SUM(CASE
            WHEN channel_type = 2
             AND g.campaign_name ~* 'ED\s+\|'
             AND NOT (g.campaign_name = ANY(search_exclusions))
             AND NOT EXISTS (
               SELECT 1 FROM google_ads_campaign_overrides o
               WHERE o.period_label = p_period_label
                 AND o.google_ads_customer_id = g.google_ads_customer_id
                 AND o.campaign_id = g.campaign_id
                 AND o.excluded = true
             )
            THEN g.cost_usd ELSE 0 END), 0) AS search_cost,
          COALESCE(SUM(g.conversion_value), 0) AS gross_revenue,
          COALESCE(SUM(g.cost_usd), 0)         AS gross_cost,
          COUNT(*)                              AS campaign_count
        FROM google_ads_spend g
        WHERE g.period_label = p_period_label
          AND g.google_ads_customer_id = ANY(v_all_ids)
      ),
      calc AS (
        SELECT s.*,
          CASE rec.billing_method WHEN 'ADS_REVENUE' THEN s.shopping_revenue WHEN 'ADS_COST' THEN s.shopping_cost END AS shopping_base,
          CASE rec.billing_method WHEN 'ADS_REVENUE' THEN s.search_revenue   WHEN 'ADS_COST' THEN s.search_cost   END AS search_base
        FROM spend s
      )
      INSERT INTO expected_charges (period_label, stripe_id, account_name, batch, expected_amount, source, billing_detail)
      SELECT
        p_period_label, rec.stripe_id, rec.display_name, rec.batch,
        ROUND(rec.base_fee + (c.shopping_base + c.search_base) * rec.billing_percentage, 4),
        rec.billing_method,
        jsonb_build_object(
          'base_fee', rec.base_fee, 'billing_pct', rec.billing_percentage,
          'billing_method', rec.billing_method, 'google_customer_id', rec.google_ads_customer_id,
          'all_customer_ids', to_jsonb(v_all_ids),
          'shopping_revenue', c.shopping_revenue, 'shopping_cost', c.shopping_cost,
          'search_revenue', c.search_revenue, 'search_cost', c.search_cost,
          'ads_base', c.shopping_base + c.search_base,
          'gross_revenue', c.gross_revenue, 'gross_cost', c.gross_cost, 'campaign_count', c.campaign_count,
          'bing_revenue', 0, 'bing_percent', 0, 'dfw', 0,
          'date_from', v_data_start, 'date_to', v_data_end,
          'memo', rec.display_name || ' ' || split_part(p_period_label, ' ', 1) || ' Invoice',
          'line_items', (
            SELECT jsonb_agg(item ORDER BY ord)
            FROM (VALUES
              (1, jsonb_build_object(
                'text', CASE WHEN c.search_base > 0.005
                  THEN 'Google Shopping + Text Ads $' || rec.base_fee::int::text || ' + ' || v_pct_label || ' of add revenue'
                  ELSE 'Google Shopping $'            || rec.base_fee::int::text || ' + ' || v_pct_label || ' of add revenue'
                END, 'amount', rec.base_fee)),
              (2, jsonb_build_object(
                'text', v_pct_label || ' of revenue from Google Shopping advertising (not including Brand) Revenue ' || v_date_range || ' $' || to_char(ROUND(c.shopping_base, 2), 'FM999,999,990.00'),
                'amount', ROUND(c.shopping_base * rec.billing_percentage, 2))),
              (3, jsonb_build_object(
                'text', v_pct_label || ' of revenue from Google Text Ads advertising (not including Brand) Revenue ' || v_date_range || ' $' || to_char(ROUND(c.search_base, 2), 'FM999,999,990.00'),
                'amount', ROUND(c.search_base * rec.billing_percentage, 2)))
            ) AS t(ord, item)
          )
        )
      FROM calc c
      WHERE c.campaign_count > 0;

      GET DIAGNOSTICS v_inserted_now = ROW_COUNT;
      v_rows_inserted := v_rows_inserted + v_inserted_now;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('stripe_id', rec.stripe_id, 'google_id', rec.google_ads_customer_id, 'error', SQLERRM);
    END;
  END LOOP;

  -- Restore manual fields saved before DELETE
  UPDATE expected_charges ec
  SET
    billing_detail    = ec.billing_detail
                        || jsonb_build_object(
                             'bing_revenue', (v_manual_snapshot->ec.stripe_id->>'bing_revenue')::numeric,
                             'bing_percent', (v_manual_snapshot->ec.stripe_id->>'bing_percent')::numeric,
                             'dfw',          (v_manual_snapshot->ec.stripe_id->>'dfw')::numeric
                           ),
    expected_amount   = ROUND(
                          (ec.billing_detail->>'base_fee')::numeric
                          + (
                              (ec.billing_detail->>'ads_base')::numeric
                              + (v_manual_snapshot->ec.stripe_id->>'bing_revenue')::numeric
                            ) * (ec.billing_detail->>'billing_pct')::numeric
                          + (v_manual_snapshot->ec.stripe_id->>'dfw')::numeric,
                          4
                        ),
    ready_for_billing = COALESCE((v_manual_snapshot->ec.stripe_id->>'ready_for_billing')::boolean, false),
    invoice_url       = v_manual_snapshot->ec.stripe_id->>'invoice_url',
    invoice_status    = v_manual_snapshot->ec.stripe_id->>'invoice_status'
  WHERE ec.period_label = p_period_label
    AND ec.source IN ('ADS_REVENUE','ADS_COST')
    AND v_manual_snapshot ? ec.stripe_id
    AND (
      (v_manual_snapshot->ec.stripe_id->>'bing_revenue')::numeric > 0
      OR (v_manual_snapshot->ec.stripe_id->>'dfw')::numeric > 0
      OR (v_manual_snapshot->ec.stripe_id->>'ready_for_billing')::boolean = true
      OR (v_manual_snapshot->ec.stripe_id->>'invoice_url') IS NOT NULL
    );

  RETURN jsonb_build_object('ok', jsonb_array_length(v_errors) = 0, 'period_label', p_period_label,
    'rows_deleted', v_rows_deleted, 'rows_inserted', v_rows_inserted, 'errors', v_errors);
END;
$$;

GRANT EXECUTE ON FUNCTION generate_ads_billing(text) TO anon;

-- DOWN: restore v9 (see 20260617000004)
