CREATE OR REPLACE FUNCTION public.my_shift_context(_property_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; m public.organization_members; c public.cleaners; v_open jsonb; v_enabled boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF _property_id IS NULL THEN v_org:=public.default_organization_id();
 ELSE SELECT organization_id INTO v_org FROM public.properties WHERE id=_property_id AND active; END IF;
 IF v_org IS NULL THEN RETURN jsonb_build_object('status','no_membership','can_manage_team',false); END IF;
 SELECT om.* INTO m FROM public.organization_members om JOIN public.organizations o ON o.id=om.organization_id AND o.active WHERE om.organization_id=v_org AND om.user_id=auth.uid() AND om.active;
 IF m.id IS NULL THEN RETURN jsonb_build_object('status','no_membership','can_manage_team',false); END IF;
 SELECT * INTO c FROM public.cleaners WHERE user_id=auth.uid() AND organization_id=v_org;
 v_enabled:=COALESCE(c.time_tracking_enabled,false) AND (m.role='cleaner' OR EXISTS(SELECT 1 FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=v_org AND d.is_worker));
 SELECT jsonb_build_object('id',e.id,'property_id',e.property_id,'clock_in_at',e.clock_in_at,'break_minutes',e.break_minutes,'break_started_at',e.break_started_at,'properties',jsonb_build_object('name',p.name),'requires_exit_location',p.latitude IS NOT NULL AND p.longitude IS NOT NULL) INTO v_open FROM public.time_entries e JOIN public.properties p ON p.id=e.property_id WHERE e.cleaner_id=c.id AND e.organization_id=v_org AND e.clock_out_at IS NULL;
 RETURN jsonb_build_object('status',CASE WHEN v_enabled THEN 'employee' ELSE 'not_employee' END,'can_manage_team',public.has_organization_permission(v_org,'manage_team'),'cleaner',CASE WHEN v_enabled OR v_open IS NOT NULL THEN jsonb_build_object('id',c.id,'full_name',c.full_name) ELSE NULL END,'open',v_open);
END $$;
REVOKE ALL ON FUNCTION public.my_shift_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_shift_context(uuid) TO authenticated,service_role;