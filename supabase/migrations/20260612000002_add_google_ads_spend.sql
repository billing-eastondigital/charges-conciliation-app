-- ============================================================
-- Migration 20260612000002 — google_ads_spend table
--
-- Stores raw ad spend from the Google Ads reporting service,
-- one row per (period_label, google_ads_customer_id, campaign_id).
--
-- Ingest strategy: DELETE all rows for the period + re-insert.
-- This makes re-pulls idempotent without needing upsert logic.
-- See ADR 0005.
-- ============================================================

CREATE TABLE google_ads_spend (
  id                      bigserial   PRIMARY KEY,
  period_label            text        NOT NULL REFERENCES periods(period_label) ON DELETE CASCADE,
  google_ads_customer_id  text        NOT NULL,
  campaign_id             text        NOT NULL,
  campaign_name           text,

  -- Spend figures in USD (as returned by the reporting service)
  impressions             bigint      NOT NULL DEFAULT 0,
  clicks                  bigint      NOT NULL DEFAULT 0,
  cost_micros             bigint      NOT NULL DEFAULT 0,  -- raw micros from Google API
  cost_usd                numeric(12,2) GENERATED ALWAYS AS (cost_micros / 1000000.0) STORED,
  conversions             numeric(10,2) NOT NULL DEFAULT 0,
  conversion_value        numeric(12,2) NOT NULL DEFAULT 0,  -- revenue attributed (ADS_REVENUE billing)

  -- Audit
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX google_ads_spend_period_idx
  ON google_ads_spend (period_label);

CREATE INDEX google_ads_spend_customer_period_idx
  ON google_ads_spend (google_ads_customer_id, period_label);

ALTER TABLE google_ads_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_google_ads_spend"
  ON google_ads_spend FOR SELECT TO anon USING (true);

CREATE POLICY "service_write_google_ads_spend"
  ON google_ads_spend FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  google_ads_spend IS 'Raw Google Ads spend per campaign per period. Pulled by ingest-google-ads edge function. Re-pull = delete + re-insert for the period. See ADR 0005.';
COMMENT ON COLUMN google_ads_spend.cost_micros IS 'Raw cost in Google micros (1/1,000,000 USD). Stored as-is to avoid floating point.';
COMMENT ON COLUMN google_ads_spend.cost_usd IS 'Computed column: cost_micros / 1,000,000. Use this for billing calculations.';
COMMENT ON COLUMN google_ads_spend.conversion_value IS 'Revenue attributed to this campaign. Used for ADS_REVENUE billing method.';

-- Convenience view: spend aggregated per (period, customer) — used by reconcile-period
CREATE VIEW google_ads_spend_by_customer AS
SELECT
  period_label,
  google_ads_customer_id,
  SUM(cost_usd)          AS total_cost_usd,
  SUM(conversion_value)  AS total_revenue_usd,
  SUM(clicks)            AS total_clicks,
  SUM(impressions)       AS total_impressions,
  MAX(fetched_at)        AS last_fetched_at
FROM google_ads_spend
GROUP BY period_label, google_ads_customer_id;

COMMENT ON VIEW google_ads_spend_by_customer IS 'Google Ads spend rolled up per (period, customer). Used by reconcile-period to compute ADS_REVENUE/ADS_COST expected charges.';

-- DOWN:
-- DROP VIEW google_ads_spend_by_customer;
-- DROP TABLE google_ads_spend;
