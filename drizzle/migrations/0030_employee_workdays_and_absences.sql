CREATE TABLE public.employee_work_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), member_id uuid NOT NULL REFERENCES public.organization_members(id), effective_from date NOT NULL, weekdays integer[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(member_id,effective_from)
);
GRANT SELECT, INSERT, UPDATE ON public.employee_work_schedules TO authenticated;
GRANT ALL ON public.employee_work_schedules TO service_role;
ALTER TABLE public.employee_work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedules_management ON public.employee_work_schedules FOR ALL TO authenticated USING (public.has_organization_permission(organization_id,'manage_team')) WITH CHECK (public.has_organization_permission(organization_id,'manage_team'));
CREATE POLICY schedules_self_read ON public.employee_work_schedules FOR SELECT TO authenticated USING (public.is_organization_member(organization_id) AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.id=member_id AND m.user_id=auth.uid() AND m.organization_id=employee_work_schedules.organization_id));
CREATE TABLE public.employee_absences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), member_id uuid NOT NULL REFERENCES public.organization_members(id), start_date date NOT NULL, end_date date NOT NULL, kind text NOT NULL, note text NOT NULL DEFAULT '', cancelled boolean NOT NULL DEFAULT false, correction_reason text NOT NULL DEFAULT '', created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.employee_absences TO authenticated;
GRANT ALL ON public.employee_absences TO service_role;
ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY absences_management ON public.employee_absences FOR ALL TO authenticated USING (public.has_organization_permission(organization_id,'manage_team')) WITH CHECK (public.has_organization_permission(organization_id,'manage_team'));
CREATE POLICY absences_self_read ON public.employee_absences FOR SELECT TO authenticated USING (public.is_organization_member(organization_id) AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.id=member_id AND m.user_id=auth.uid() AND m.organization_id=employee_absences.organization_id));
CREATE INDEX employee_absences_member_dates ON public.employee_absences(member_id,start_date,end_date);
CREATE FUNCTION public.validate_employee_attendance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE id=NEW.member_id AND organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'invalid_employee_organization' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.member_id<>OLD.member_id OR NEW.organization_id<>OLD.organization_id) THEN RAISE EXCEPTION 'immutable_employee' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='employee_work_schedules' THEN
   IF EXISTS(SELECT 1 FROM unnest(NEW.weekdays) d WHERE d IS NULL OR d<1 OR d>7) OR cardinality(NEW.weekdays)<>(SELECT count(DISTINCT d) FROM unnest(NEW.weekdays) d) THEN RAISE EXCEPTION 'invalid_weekdays' USING ERRCODE='23514'; END IF;
 ELSE
   IF NEW.end_date<NEW.start_date OR NEW.end_date-NEW.start_date>366 OR NEW.kind NOT IN ('sick','leave','excused','unexcused') OR length(NEW.note)>500 THEN RAISE EXCEPTION 'invalid_absence' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' THEN
     IF length(trim(NEW.correction_reason))=0 THEN RAISE EXCEPTION 'correction_reason_required' USING ERRCODE='23514'; END IF;
     NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at;
   ELSE NEW.created_by:=auth.uid(); END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(NEW.member_id::text,0));
   IF NOT NEW.cancelled AND EXISTS(SELECT 1 FROM public.employee_absences a WHERE a.member_id=NEW.member_id AND a.id<>NEW.id AND NOT a.cancelled AND a.start_date<=NEW.end_date AND a.end_date>=NEW.start_date) THEN RAISE EXCEPTION 'absence_overlap' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER validate_employee_work_schedule BEFORE INSERT OR UPDATE ON public.employee_work_schedules FOR EACH ROW EXECUTE FUNCTION public.validate_employee_attendance();
CREATE TRIGGER validate_employee_absence BEFORE INSERT OR UPDATE ON public.employee_absences FOR EACH ROW EXECUTE FUNCTION public.validate_employee_attendance();
SELECT public.attach_audit('public.employee_work_schedules');
SELECT public.attach_audit('public.employee_absences');