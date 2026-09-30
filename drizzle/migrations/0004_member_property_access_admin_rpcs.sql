CREATE OR REPLACE FUNCTION public.admin_get_member_properties(_user_id uuid)
RETURNS TABLE(property_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public.default_organization_id();
BEGIN
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT a.property_id FROM public.member_property_access a
    JOIN public.organization_members m ON m.id = a.member_id
   WHERE m.organization_id = v_org AND m.user_id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_member_properties(_user_id uuid, _property_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_org uuid := public.default_organization_id(); v_member uuid;
BEGIN
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO v_member FROM public.organization_members WHERE organization_id = v_org AND user_id = _user_id;
  IF v_member IS NULL THEN RAISE EXCEPTION 'not a member'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(_property_ids, ARRAY[]::uuid[])) pid
             WHERE NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = pid AND p.organization_id = v_org)) THEN
    RAISE EXCEPTION 'property not in organization';
  END IF;
  DELETE FROM public.member_property_access WHERE member_id = v_member
    AND NOT (property_id = ANY(COALESCE(_property_ids, ARRAY[]::uuid[])));
  INSERT INTO public.member_property_access(organization_id, member_id, property_id)
  SELECT v_org, v_member, pid FROM unnest(COALESCE(_property_ids, ARRAY[]::uuid[])) pid
  WHERE NOT EXISTS (SELECT 1 FROM public.member_property_access a WHERE a.member_id = v_member AND a.property_id = pid);
END $$;

REVOKE ALL ON FUNCTION public.admin_get_member_properties(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_member_properties(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_member_properties(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_properties(uuid, uuid[]) TO authenticated;