CREATE TABLE public.room_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.cleaning_tasks(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('damage','plumbing','electric','missing','dirty','other')),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  reported_by uuid DEFAULT auth.uid(),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_issues_org_status_idx ON public.room_issues(organization_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.room_issues TO authenticated;
GRANT ALL ON public.room_issues TO service_role;
ALTER TABLE public.room_issues ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.room_issues_before_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT r.property_id, p.organization_id INTO NEW.property_id, NEW.organization_id
      FROM public.rooms r JOIN public.properties p ON p.id = r.property_id WHERE r.id = NEW.room_id;
    NEW.reported_by := auth.uid();
    NEW.status := 'open'; NEW.resolved_by := NULL; NEW.resolved_at := NULL;
  ELSE
    NEW.organization_id := OLD.organization_id; NEW.property_id := OLD.property_id; NEW.room_id := OLD.room_id;
    NEW.reported_by := OLD.reported_by; NEW.created_at := OLD.created_at;
    IF NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN NEW.resolved_at := now(); NEW.resolved_by := auth.uid(); END IF;
    IF NEW.status = 'open' THEN NEW.resolved_at := NULL; NEW.resolved_by := NULL; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER room_issues_before_write BEFORE INSERT OR UPDATE ON public.room_issues FOR EACH ROW EXECUTE FUNCTION public.room_issues_before_write();

CREATE POLICY "read room issues" ON public.room_issues FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id) AND (public.can_access_property(property_id) OR reported_by = auth.uid()));
CREATE POLICY "report room issues" ON public.room_issues FOR INSERT TO authenticated
  WITH CHECK (public.is_organization_member(organization_id) AND (public.can_access_property(property_id)
    OR EXISTS (SELECT 1 FROM public.cleaning_tasks t JOIN public.cleaners c ON c.id = t.cleaner_id WHERE t.room_id = room_issues.room_id AND c.user_id = auth.uid())));
CREATE POLICY "managers resolve room issues" ON public.room_issues FOR UPDATE TO authenticated
  USING (public.can_access_property(property_id) AND (public.is_org_admin(organization_id) OR public.has_organization_permission(organization_id, 'manage_rooms') OR public.has_organization_permission(organization_id, 'assign_cleaning')))
  WITH CHECK (public.can_access_property(property_id));
SELECT public.attach_audit('public.room_issues'::regclass);