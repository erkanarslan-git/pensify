ALTER TABLE public.member_departments ALTER COLUMN lead_can_report SET DEFAULT false;
CREATE OR REPLACE FUNCTION public.my_report_teams() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN m.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=m.organization_id AND d.department='hr' AND d.lead_can_report) THEN ARRAY['all','cleaning','office','maintenance']::text[] ELSE ARRAY(SELECT d.department FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=m.organization_id AND d.is_lead AND d.lead_can_report AND d.department IN ('cleaning','office','maintenance') ORDER BY d.department) END
 FROM public.organization_members m JOIN public.organizations o ON o.id=m.organization_id AND o.active WHERE m.organization_id=public.active_organization_id() AND m.user_id=auth.uid() AND m.active
$$;
REVOKE ALL ON FUNCTION public.my_report_teams() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_report_teams() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.has_department_power(_org uuid, _target_user uuid, _power text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id
  WHERE d.organization_id=_org AND m.user_id=auth.uid() AND m.active AND d.department='hr'
   AND (_power IN ('time','absence') OR (_power='report' AND d.lead_can_report))
 ) OR EXISTS (
  SELECT 1 FROM public.member_departments l JOIN public.organization_members lm ON lm.id=l.member_id
  JOIN public.member_departments t ON t.department=l.department AND t.organization_id=l.organization_id
  JOIN public.organization_members tm ON tm.id=t.member_id
  WHERE l.organization_id=_org AND lm.user_id=auth.uid() AND lm.active AND l.is_lead
   AND tm.user_id=_target_user AND t.is_worker
   AND CASE _power WHEN 'assign' THEN l.lead_can_assign WHEN 'time' THEN l.lead_can_fix_time
    WHEN 'absence' THEN l.lead_can_absence WHEN 'report' THEN l.lead_can_report ELSE false END
 )
$$;
GRANT EXECUTE ON FUNCTION public.has_department_power(uuid,uuid,text) TO authenticated;
COMMENT ON FUNCTION public.my_report_teams() IS 'Work reports default to active owner/admin in the caller organization; all other members require explicit department report permission.';