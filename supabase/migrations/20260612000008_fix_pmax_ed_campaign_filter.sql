-- Fix: campaigns named "PMax: ED | ..." (e.g. "PMax: ED | Shopping | Smart") were excluded
-- by the strict 'ED |%' prefix filter. Add OR campaign_name LIKE 'PMax: ED |%' to include them.
-- Applied via MCP before this file was committed. This file is for migration history.
SELECT 1;
