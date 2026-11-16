CREATE TABLE public.voice_agent_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  agent_id text UNIQUE,
  service_from time NOT NULL DEFAULT '19:00',
  service_to time NOT NULL DEFAULT '08:00',
  default_language text NOT NULL DEFAULT 'de' CHECK (default_language IN ('de','en','tr')),
  fallback_phone text,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.voice_agent_settings TO authenticated;
GRANT ALL ON public.voice_agent_settings TO service_role;
ALTER TABLE public.voice_agent_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read voice settings" ON public.voice_agent_settings FOR SELECT TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY "admins insert voice settings" ON public.voice_agent_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY "admins update voice settings" ON public.voice_agent_settings FOR UPDATE TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]))
  WITH CHECK (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));

CREATE TABLE public.voice_on_call (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  duty_date date NOT NULL,
  staff_name text NOT NULL CHECK (length(staff_name) BETWEEN 1 AND 120),
  phone text NOT NULL CHECK (phone ~ '^\+?[0-9 ()/-]{6,25}$'),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, duty_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_on_call TO authenticated;
GRANT ALL ON public.voice_on_call TO service_role;
ALTER TABLE public.voice_on_call ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage on call" ON public.voice_on_call FOR ALL TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]))
  WITH CHECK (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));

CREATE TABLE public.voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  caller_phone text,
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  language text,
  outcome text NOT NULL DEFAULT 'info' CHECK (outcome IN ('info','reservation','access_code','transferred','unresolved','failed')),
  successful boolean,
  summary text,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  transferred_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);
CREATE INDEX voice_calls_org_started_idx ON public.voice_calls(organization_id, started_at DESC);
GRANT SELECT ON public.voice_calls TO authenticated;
GRANT ALL ON public.voice_calls TO service_role;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read voice calls" ON public.voice_calls FOR SELECT TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));