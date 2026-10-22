CREATE TABLE public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  notes text,
  due_date date,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX todos_org_due_idx ON public.todos(organization_id, done, due_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todos TO authenticated;
GRANT ALL ON public.todos TO service_role;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.todos_before_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.organization_id := COALESCE(NEW.organization_id, public.active_organization_id());
    NEW.created_by := auth.uid();
  ELSE
    NEW.organization_id := OLD.organization_id;
    NEW.created_by := OLD.created_by;
  END IF;
  IF NEW.done AND (TG_OP = 'INSERT' OR NOT OLD.done) THEN NEW.done_at := now(); NEW.done_by := auth.uid(); END IF;
  IF NOT NEW.done THEN NEW.done_at := NULL; NEW.done_by := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER todos_before_write BEFORE INSERT OR UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.todos_before_write();
CREATE POLICY "members read todos" ON public.todos FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));
CREATE POLICY "members add todos" ON public.todos FOR INSERT TO authenticated WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "members update todos" ON public.todos FOR UPDATE TO authenticated USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id));
CREATE POLICY "admins delete todos" ON public.todos FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) OR created_by = auth.uid());
SELECT public.attach_audit('public.todos'::regclass);