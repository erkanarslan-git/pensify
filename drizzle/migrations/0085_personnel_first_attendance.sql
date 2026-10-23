CREATE FUNCTION public.attendance_personnel() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id();
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.my_time_management_access() THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN jsonb_build_object('org',org,'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'name',coalesce(nullif(p.full_name,''),c.full_name,'—'),'active',m.active) ORDER BY coalesce(p.full_name,c.full_name),m.id) FROM public.organization_members m LEFT JOIN public.profiles p ON p.id=m.user_id LEFT JOIN public.cleaners c ON c.user_id=m.user_id AND c.organization_id=org WHERE m.organization_id=org AND public.can_read_employee_time(org,m.user_id,NULL)),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.attendance_personnel() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attendance_personnel() TO authenticated,service_role;
CREATE FUNCTION public.personnel_overtime(_from date,_to date,_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id();
BEGIN
 IF _user_id IS NULL OR org IS NULL OR NOT public.my_time_management_access() OR NOT public.can_read_employee_time(org,_user_id,NULL) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR _to-_from>366 THEN RAISE EXCEPTION 'invalid_range'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'clock_in_at',e.clock_in_at,'clock_out_at',e.clock_out_at,'break_minutes',e.break_minutes,'property',p.name,'minutes',coalesce(o.minutes,0),'approved_at',o.approved_at,'approved_by',coalesce(pr.full_name,'—'),'reason',o.reason,'can_approve',c.user_id<>auth.uid() AND e.paid_at IS NULL AND (public.is_org_admin(org) OR public.has_department_power(org,_user_id,'time')))) FROM public.time_entries e JOIN public.cleaners c ON c.id=e.cleaner_id AND c.organization_id=org JOIN public.properties p ON p.id=e.property_id AND p.organization_id=org LEFT JOIN public.time_entry_overtime o ON o.time_entry_id=e.id AND o.organization_id=org LEFT JOIN public.profiles pr ON pr.id=o.approved_by WHERE e.organization_id=org AND c.user_id=_user_id AND public.can_read_employee_time(org,_user_id,e.property_id) AND e.clock_out_at IS NOT NULL AND NOT e.needs_review AND e.clock_in_at<((_to+1)::timestamp AT TIME ZONE 'Europe/Berlin') AND e.clock_out_at>(_from::timestamp AT TIME ZONE 'Europe/Berlin')),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.personnel_overtime(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personnel_overtime(date,date,uuid) TO authenticated,service_role;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.employee_attendance_board(date,date,uuid)'::regprocedure) INTO d;
 d:=replace(d,'''review_reason'',e.review_reason','''review_reason'',e.review_reason,''can_correct'',(public.is_org_admin(org) OR (c.user_id<>auth.uid() AND (public.has_organization_permission(org,''manage_time'') OR public.has_department_power(org,c.user_id,''time'')) AND public.can_access_property(e.property_id)))');
 EXECUTE d;
END $$;