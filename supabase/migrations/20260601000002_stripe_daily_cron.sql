-- ============================================================
-- Migration 20260601000002 — daily Stripe sync via pg_cron
--
-- Enables pg_net (async HTTP) and pg_cron (job scheduler),
-- then schedules a daily call to the ingest-stripe edge function
-- at 08:00 UTC. The function resolves period_label="auto" to
-- the current open period, so no manual update is needed when
-- a new period starts.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Remove existing job if present (makes migration idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-stripe-daily') THEN
    PERFORM cron.unschedule('sync-stripe-daily');
  END IF;
END $$;

-- Schedule: every day at 08:00 UTC
SELECT cron.schedule(
  'sync-stripe-daily',
  '0 8 * * *',
  $$
  SELECT extensions.http_post(
    url    := 'https://unogorchezflktiweebg.supabase.co/functions/v1/ingest-stripe',
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA'
    ),
    body   := '{"period_label": "auto", "account": "both"}'::jsonb
  );
  $$
);

-- DOWN:
-- SELECT cron.unschedule('sync-stripe-daily');
-- DROP EXTENSION IF EXISTS pg_cron;
-- DROP EXTENSION IF EXISTS pg_net;
