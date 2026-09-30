-- lovable-cron-fallback-reviewed: replaces the existing every-minute morning dispatch job (same cadence) only to swap the publishable-key header for a private cron secret
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.cron_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.cron_secrets FROM PUBLIC, anon, authenticated;
INSERT INTO private.cron_secrets(name, value)
VALUES ('dispatch', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(_name text, _value text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = private, public AS $$
DECLARE v text;
BEGIN
  IF _value IS NULL OR length(_value) < 16 THEN RETURN false; END IF;
  SELECT value INTO v FROM private.cron_secrets WHERE name = _name;
  IF v IS NULL THEN RETURN false; END IF;
  RETURN extensions.digest(v, 'sha256') = extensions.digest(_value, 'sha256');
END $$;
REVOKE EXECUTE ON FUNCTION public.verify_cron_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text, text) TO service_role;

CREATE TABLE public.cron_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  status text NOT NULL,
  detail jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.cron_executions TO authenticated;
GRANT ALL ON public.cron_executions TO service_role;
ALTER TABLE public.cron_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cron executions" ON public.cron_executions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX cron_executions_started_idx ON public.cron_executions(started_at DESC);

SELECT cron.schedule(
  'dispatch-morning-check',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--c3bce140-98e6-40ed-a35c-6ad0fa40d481.lovable.app/api/public/hooks/dispatch-morning',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM private.cron_secrets WHERE name='dispatch')),
    body := '{}'::jsonb
  );
  $cron$
);