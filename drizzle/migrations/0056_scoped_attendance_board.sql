CREATE OR REPLACE FUNCTION public.can_read_employee_time(_org uuid, _user uuid, _property uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_organization_member(_org) AND (
 public.is_org_admin(_org) OR
 EXISTS(SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id AND m.organization_id=d.organization_id WHERE d.organization_id=_org AND m.user_id=auth.uid() AND m.active AND d.department='hr') OR
 (public.has_department_power(_org,_user,'time') AND (_property IS NULL OR public.can_access_property(_property))))
$$;
REVOKE ALL ON FUNCTION public.can_read_employee_time(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_employee_time(uuid,uuid,uuid) TO authenticated,service_role;
DROP POLICY IF EXISTS time_entries_department_read ON public.time_entries;
CREATE POLICY time_entries_department_read ON public.time_entries FOR SELECT TO authenticated
USING(public.can_read_employee_time(organization_id,public.cleaner_user(cleaner_id),property_id));
CREATE OR REPLACE FUNCTION public.employee_attendance_board(_from date,_to date,_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid := public.active_organization_id(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.is_organization_member(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _from IS NULL OR _to IS NULL OR _to<_from OR _to-_from>366 THEN RAISE EXCEPTION 'invalid_range'; END IF;
 IF NOT (public.is_org_admin(org) OR EXISTS(SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id AND m.organization_id=d.organization_id WHERE d.organization_id=org AND m.user_id=auth.uid() AND m.active AND (d.department='hr' OR (d.is_lead AND d.lead_can_fix_time)))) THEN RAISE EXCEPTION 'forbidden'; END IF;
 WITH targets AS (
 SELECT m.id,m.user_id,m.organization_id,m.active,coalesce(nullif(p.full_name,''),nullif(c.full_name,''),'—') AS full_name,
 (public.is_org_admin(org) OR public.has_department_power(org,m.user_id,'absence')) AS can_absence
 FROM public.organization_members m LEFT JOIN public.profiles p ON p.id=m.user_id LEFT JOIN public.cleaners c ON c.user_id=m.user_id AND c.organization_id=org
 WHERE m.organization_id=org AND (_user_id IS NULL OR m.user_id=_user_id) AND public.can_read_employee_time(org,m.user_id,NULL)
 ), visible_entries AS (
 SELECT e.* FROM public.time_entries e JOIN public.cleaners c ON c.id=e.cleaner_id AND c.organization_id=org JOIN targets t ON t.user_id=c.user_id
 WHERE e.organization_id=org AND (e.clock_in_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN _from AND _to AND public.can_read_employee_time(org,c.user_id,e.property_id)
 )
 SELECT jsonb_build_object('org',org,'timezone','Europe/Berlin','can_schedule',public.has_organization_permission(org,'manage_team'),
 'members',coalesce((SELECT jsonb_agg(to_jsonb(t) - 'full_name' ORDER BY t.full_name) FROM targets t),'[]'::jsonb),
 'profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.user_id,'full_name',t.full_name)) FROM targets t),'[]'::jsonb),
 'cleaners',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'user_id',c.user_id,'full_name',c.full_name)) FROM public.cleaners c JOIN targets t ON t.user_id=c.user_id WHERE c.organization_id=org),'[]'::jsonb),
 'schedules',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.employee_work_schedules s JOIN targets t ON t.id=s.member_id WHERE s.organization_id=org AND s.effective_from<=_to),'[]'::jsonb),
 'absences',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.employee_absences a JOIN targets t ON t.id=a.member_id WHERE a.organization_id=org AND a.start_date<=_to AND a.end_date>=_from),'[]'::jsonb),
 'entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'cleaner_id',e.cleaner_id,'clock_in_at',e.clock_in_at,'clock_out_at',e.clock_out_at,'break_minutes',e.break_minutes,'break_started_at',e.break_started_at,'needs_review',e.needs_review,'properties',jsonb_build_object('name',p.name))) FROM visible_entries e JOIN public.properties p ON p.id=e.property_id),'[]'::jsonb),
 'breaks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'time_entry_id',b.time_entry_id,'started_at',b.started_at,'ended_at',b.ended_at) ORDER BY b.started_at) FROM public.time_entry_breaks b JOIN visible_entries e ON e.id=b.time_entry_id WHERE b.organization_id=org),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.employee_attendance_board(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_attendance_board(date,date,uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.employee_attendance_board(date,date,uuid) IS 'Caller-scoped attendance and CSV source: admin all, HR organization-wide, time-enabled leads own workers and accessible property sessions; no rates, payment fields or coordinates.';