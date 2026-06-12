-- ============================================================
-- Migration 20260612000006 — daily cron for ingest-google-ads
--
-- Runs daily at 14:00 UTC (= 07:00 AM Los Angeles time, year-round safe buffer).
-- The function itself checks billing_day_one = today(LA), so running daily
-- is safe — only due clients are processed.
--
-- Separate from sync-stripe-daily intentionally (ADR 0005):
-- Google Ads ingestion failure must not block Stripe reconciliation.
-- ============================================================

SELECT cron.schedule(
  'sync-gads-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/ingest-google-ads',
    body   := '{"period_label":"auto"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  );
  $$
);

-- DOWN:
-- SELECT cron.unschedule('sync-gads-daily');
