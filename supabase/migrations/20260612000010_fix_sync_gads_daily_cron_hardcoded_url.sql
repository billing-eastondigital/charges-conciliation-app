-- Fix sync-gads-daily cron: use hardcoded URL + anon key, same pattern as sync-stripe-daily.
-- The previous version used current_setting('app.supabase_url') which is NULL in this project
-- → the http_post URL resolved to NULL and the cron never fired (runid always NULL).

SELECT cron.alter_job(
  job_id  := 2,
  command := $cmd$
  SELECT net.http_post(
    url     := 'https://unogorchezflktiweebg.supabase.co/functions/v1/ingest-google-ads',
    body    := '{"period_label":"auto"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA'
    )
  );
  $cmd$
);

-- DOWN:
-- SELECT cron.alter_job(job_id := 2, command := $cmd$
--   SELECT net.http_post(
--     url     := current_setting('app.supabase_url') || '/functions/v1/ingest-google-ads',
--     body    := '{"period_label":"auto"}'::jsonb,
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.service_role_key'))
--   );
-- $cmd$);
