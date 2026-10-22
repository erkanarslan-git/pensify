CREATE TABLE public.member_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  department text NOT NULL CHECK (department IN ('cleaning','maintenance','office','hr')),
  is_worker boolean NOT NULL DEFAULT true,
  is_lead boolean NOT NULL DEFAULT false,
  lead_can_assign boolean NOT NULL DEFAULT true,
  lead_can_fix_time boolean NOT NULL DEFAULT true,
  lead_can_absence boolean NOT NULL DEFAULT true,
  lead_can_report boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, department),
  CHECK (is_worker OR is_lead)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_departments TO authenticated;
GRANT ALL ON public.member_departments TO service_role;
ALTER TABLE public.member_departments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.member_departments_before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT organization_id INTO NEW.organization_id FROM public.organization_members WHERE id = NEW.member_id;
  IF NEW.organization_id IS NULL THEN RAISE EXCEPTION 'unknown_member'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER member_departments_bw BEFORE INSERT OR UPDATE ON public.member_departments
FOR EACH ROW EXECUTE FUNCTION public.member_departments_before_write();
SELECT public.attach_audit('public.member_departments');

CREATE POLICY md_read ON public.member_departments FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY md_manage ON public.member_departments FOR ALL TO authenticated
  USING (public.has_organization_permission(organization_id,'manage_team'))
  WITH CHECK (public.has_organization_permission(organization_id,'manage_team'));

-- Caller is HR in org, or an active lead (with the given power) of a department the target user belongs to.
CREATE OR REPLACE FUNCTION public.has_department_power(_org uuid, _target_user uuid, _power text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id = d.member_id
    WHERE d.organization_id = _org AND m.user_id = auth.uid() AND m.active AND d.department = 'hr'
      AND _power IN ('time','absence','report')
  ) OR EXISTS (
    SELECT 1 FROM public.member_departments l JOIN public.organization_members lm ON lm.id = l.member_id
    JOIN public.member_departments t ON t.department = l.department AND t.organization_id = l.organization_id
    JOIN public.organization_members tm ON tm.id = t.member_id
    WHERE l.organization_id = _org AND lm.user_id = auth.uid() AND lm.active AND l.is_lead
      AND tm.user_id = _target_user AND t.is_worker
      AND CASE _power WHEN 'assign' THEN l.lead_can_assign WHEN 'time' THEN l.lead_can_fix_time
                      WHEN 'absence' THEN l.lead_can_absence WHEN 'report' THEN l.lead_can_report ELSE false END
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_department_power(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.member_user(_member uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT user_id FROM public.organization_members WHERE id = _member
$$;
CREATE OR REPLACE FUNCTION public.cleaner_user(_cleaner uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT user_id FROM public.cleaners WHERE id = _cleaner
$$;
GRANT EXECUTE ON FUNCTION public.member_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleaner_user(uuid) TO authenticated;

CREATE POLICY absences_department ON public.employee_absences FOR ALL TO authenticated
  USING (public.has_department_power(organization_id, public.member_user(member_id), 'absence'))
  WITH CHECK (public.has_department_power(organization_id, public.member_user(member_id), 'absence'));
CREATE POLICY schedules_department_read ON public.employee_work_schedules FOR SELECT TO authenticated
  USING (public.has_department_power(organization_id, public.member_user(member_id), 'absence'));
CREATE POLICY time_entries_department_read ON public.time_entries FOR SELECT TO authenticated
  USING (public.has_department_power(organization_id, public.cleaner_user(cleaner_id), 'time'));

CREATE OR REPLACE FUNCTION public.correct_time_entry(_entry_id uuid, _clock_in_at timestamptz, _clock_out_at timestamptz, _break_minutes integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF coalesce(length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO e FROM public.time_entries WHERE id = _entry_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_org_admin(e.organization_id)
       OR (public.has_organization_permission(e.organization_id,'manage_time') AND public.can_access_property(e.property_id))
       OR public.has_department_power(e.organization_id, public.cleaner_user(e.cleaner_id), 'time')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF public.cleaner_user(e.cleaner_id) = auth.uid() AND NOT public.is_org_admin(e.organization_id) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF _clock_out_at IS NOT NULL AND _clock_out_at <= _clock_in_at THEN RAISE EXCEPTION 'invalid_range'; END IF;
  IF _clock_out_at IS NOT NULL AND _clock_out_at > now() THEN RAISE EXCEPTION 'future_time'; END IF;
  IF EXISTS (SELECT 1 FROM public.time_entries o WHERE o.cleaner_id = e.cleaner_id AND o.id <> e.id
      AND tstzrange(o.clock_in_at, coalesce(o.clock_out_at, 'infinity')) && tstzrange(_clock_in_at, coalesce(_clock_out_at,'infinity'))) THEN
    RAISE EXCEPTION 'overlap'; END IF;
  PERFORM set_config('app.correction_reason', _reason, true);
  UPDATE public.time_entries SET clock_in_at = _clock_in_at, clock_out_at = _clock_out_at,
    break_minutes = greatest(0, coalesce(_break_minutes, 0)), break_started_at = CASE WHEN _clock_out_at IS NULL THEN break_started_at END,
    status = CASE WHEN _clock_out_at IS NULL THEN status ELSE 'manually_adjusted' END,
    needs_review = false, manual_override_by = auth.uid(), manual_override_at = now(),
    notes = coalesce(notes || ' · ', '') || _reason
  WHERE id = e.id;
  PERFORM set_config('app.correction_reason', '', true);
END $$;
GRANT EXECUTE ON FUNCTION public.correct_time_entry(uuid, timestamptz, timestamptz, integer, text) TO authenticated;