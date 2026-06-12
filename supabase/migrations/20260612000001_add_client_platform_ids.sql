-- ============================================================
-- Migration 20260612000001 — client_platform_ids table
--
-- Maps stripe_id → external platform customer IDs.
-- Populated from the client config CSV (data_billing_app_client_platform_ids).
-- Used by ingest-google-ads to pull spend per client.
-- See ADR 0005.
-- ============================================================

CREATE TABLE client_platform_ids (
  stripe_id               text        PRIMARY KEY REFERENCES clients(stripe_id) ON DELETE CASCADE,
  google_ads_customer_id  text,       -- numeric string, no dashes (e.g. "1234567890")
  facebook_ads_account_id text,       -- future use
  other_ids               jsonb       NOT NULL DEFAULT '{}',

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_platform_ids_google_idx
  ON client_platform_ids (google_ads_customer_id)
  WHERE google_ads_customer_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER client_platform_ids_updated_at
  BEFORE UPDATE ON client_platform_ids
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE client_platform_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_client_platform_ids"
  ON client_platform_ids FOR SELECT TO anon USING (true);

CREATE POLICY "service_write_client_platform_ids"
  ON client_platform_ids FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  client_platform_ids IS 'Maps stripe_id to external ad platform customer IDs. One row per client. See ADR 0005.';
COMMENT ON COLUMN client_platform_ids.google_ads_customer_id IS 'Google Ads customer ID — numeric string without dashes. Used by ingest-google-ads edge function.';

-- DOWN:
-- DROP TABLE client_platform_ids;
