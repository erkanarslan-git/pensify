CREATE OR REPLACE FUNCTION public.todo_member_names()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH org AS (SELECT public.active_organization_id() o),
  office AS (SELECT public.has_organization_role((SELECT o FROM org), ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) v)
  SELECT p.id, p.full_name FROM public.organization_members m JOIN public.profiles p ON p.id=m.user_id
  WHERE auth.uid() IS NOT NULL AND m.organization_id=(SELECT o FROM org) AND m.active AND (
    (SELECT v FROM office) OR m.user_id=auth.uid()
    OR m.user_id IN (SELECT unnest(t.members) FROM public.my_todo_departments() t WHERE t.is_lead))
$$;
REVOKE ALL ON FUNCTION public.todo_member_names() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.todo_member_names() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_member_name(_user_id uuid, _full_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE org uuid := public.active_organization_id(); n text := btrim(coalesce(_full_name,''));
BEGIN
  IF auth.uid() IS NULL OR org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(n) < 1 OR length(n) > 120 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=_user_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Owners can only be renamed by owners.
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=_user_id AND role='owner')
     AND NOT public.has_organization_role(org, ARRAY['owner']::public.org_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET full_name=n WHERE id=_user_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_member_name(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_name(uuid,text) TO authenticated;