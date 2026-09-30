CREATE TYPE public.org_role AS ENUM ('owner','admin','operations_manager','property_manager','reception','cleaner');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'Europe/Berlin',
  default_currency text NOT NULL DEFAULT 'EUR',
  locale text NOT NULL DEFAULT 'de',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.org_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, role)
);
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);
CREATE TABLE public.member_property_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, property_id)
);

GRANT SELECT ON public.organizations, public.organization_members, public.member_property_access TO authenticated;
GRANT ALL ON public.organizations, public.organization_members, public.member_property_access TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_property_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_organization_member(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id AND o.active
    WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.active)
$$;
CREATE OR REPLACE FUNCTION public.has_organization_role(_org uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id AND o.active
    WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.active AND m.role = ANY(_roles))
$$;

CREATE POLICY "members read own orgs" ON public.organizations FOR SELECT TO authenticated USING (public.is_organization_member(id));
CREATE POLICY "members read org members" ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_organization_role(organization_id, ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "admins read property access" ON public.member_property_access FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin']::public.org_role[])
         OR member_id IN (SELECT id FROM public.organization_members WHERE user_id = auth.uid()));

INSERT INTO public.organizations(name, slug) VALUES ('Pensify', 'pensify');

CREATE OR REPLACE FUNCTION public.default_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT m.organization_id FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.active ORDER BY m.created_at LIMIT 1),
    (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1))
$$;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT (SELECT id FROM public.organizations WHERE slug='pensify'), ur.user_id,
  (CASE ur.role::text WHEN 'manager' THEN 'operations_manager' ELSE ur.role::text END)::public.org_role
FROM public.user_roles ur ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_org_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1);
  v_role public.org_role;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_role := (CASE NEW.role::text WHEN 'manager' THEN 'operations_manager' ELSE NEW.role::text END)::public.org_role;
    INSERT INTO public.organization_members(organization_id, user_id, role) VALUES (v_org, NEW.user_id, v_role) ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSE
    v_role := (CASE OLD.role::text WHEN 'manager' THEN 'operations_manager' ELSE OLD.role::text END)::public.org_role;
    DELETE FROM public.organization_members WHERE organization_id = v_org AND user_id = OLD.user_id AND role = v_role;
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER user_roles_sync_org AFTER INSERT OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_org_membership();

DO $$
DECLARE t text; v_org uuid := (SELECT id FROM public.organizations WHERE slug='pensify');
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','rooms','cleaners','bookings','reservations','cleaning_tasks','time_entries',
    'channel_integrations','sync_jobs','conflict_alerts','audit_logs','app_settings','role_permissions','user_permissions',
    'access_requests','dispatch_messages','dispatch_replies','cron_executions','cities']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN organization_id uuid', t);
    EXECUTE format('UPDATE public.%I SET organization_id = %L', t, v_org);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.default_organization_id()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.organizations(id)', t, t || '_organization_fk');
    EXECUTE format('CREATE INDEX %I ON public.%I(organization_id)', t || '_organization_idx', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.can_access_property(_property uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.properties p
    JOIN public.organization_members m ON m.organization_id = p.organization_id AND m.user_id = auth.uid() AND m.active
    JOIN public.organizations o ON o.id = m.organization_id AND o.active
    WHERE p.id = _property AND (
      m.role IN ('owner','admin','operations_manager')
      OR EXISTS (SELECT 1 FROM public.member_property_access a WHERE a.member_id = m.id AND a.property_id = p.id)
      OR (m.role IN ('reception','cleaner') AND NOT EXISTS (SELECT 1 FROM public.member_property_access a2 WHERE a2.member_id = m.id))
    ))
$$;

REVOKE EXECUTE ON FUNCTION public.is_organization_member(uuid), public.has_organization_role(uuid, public.org_role[]),
  public.can_access_property(uuid), public.default_organization_id(), public.sync_org_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid), public.has_organization_role(uuid, public.org_role[]),
  public.can_access_property(uuid), public.default_organization_id() TO authenticated, service_role;

CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER organization_members_set_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
SELECT public.attach_audit('public.organization_members'::regclass);
SELECT public.attach_audit('public.member_property_access'::regclass);