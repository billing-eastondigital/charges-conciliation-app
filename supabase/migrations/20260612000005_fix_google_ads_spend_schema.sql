-- Fix google_ads_spend: API returns USD floats (not micros). Add channel_type + campaign_status.
-- Applied directly via MCP before this file was committed.

-- DROP VIEW IF EXISTS google_ads_spend_by_customer;
-- ALTER TABLE google_ads_spend DROP COLUMN cost_usd, DROP COLUMN cost_micros;
-- ALTER TABLE google_ads_spend ADD COLUMN channel_type smallint NOT NULL DEFAULT 0,
--   ADD COLUMN campaign_status smallint, ADD COLUMN cost_usd numeric(12,2) NOT NULL DEFAULT 0;
-- CREATE VIEW google_ads_spend_by_customer AS ...

-- Already applied. This file is here for migration history completeness.
SELECT 1;
