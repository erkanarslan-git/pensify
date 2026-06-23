
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'dispatch-morning-check',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c3bce140-98e6-40ed-a35c-6ad0fa40d481.lovable.app/api/public/hooks/dispatch-morning',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udm9zc29jcW9qc2tsZ2FjaWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1OTk5NjksImV4cCI6MjA5NzE3NTk2OX0.bGqfr0jn5YEqCtQ7-uLvOHiLBCtn9GKZLgN12r87NFE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
