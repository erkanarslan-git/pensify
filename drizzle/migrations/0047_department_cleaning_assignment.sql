CREATE OR REPLACE FUNCTION public.has_department_assignment(_org uuid, _department text, _target uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id JOIN public.organizations o ON o.id=m.organization_id
 WHERE d.organization_id=_org AND m.organization_id=_org AND m.user_id=auth.uid() AND m.active AND o.active AND d.department=_department AND d.is_lead AND d.lead_can_assign
 AND (_target IS NULL OR EXISTS (SELECT 1 FROM public.member_departments w JOIN public.organization_members tm ON tm.id=w.member_id WHERE w.organization_id=_org AND tm.organization_id=_org AND tm.active AND tm.user_id=_target AND w.department=_department AND w.is_worker)))
$$;
REVOKE ALL ON FUNCTION public.has_department_assignment(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_department_assignment(uuid,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.cleaning_assignment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE manager boolean; target_user uuid; old_user uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.cleaner_id IS NOT DISTINCT FROM OLD.cleaner_id THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.cleaner_id IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL THEN
   IF auth.role()='service_role' OR session_user IN ('postgres','supabase_admin') THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501';
 END IF;
 IF NOT public.can_access_property(NEW.property_id) OR NOT public.is_organization_member(NEW.organization_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 manager:=public.has_organization_permission(NEW.organization_id,'assign_cleaning');
 IF NEW.cleaner_id IS NOT NULL THEN
   SELECT c.user_id INTO target_user FROM public.cleaners c JOIN public.organization_members m ON m.user_id=c.user_id AND m.organization_id=c.organization_id WHERE c.id=NEW.cleaner_id AND c.organization_id=NEW.organization_id AND c.active AND m.active;
   IF target_user IS NULL THEN RAISE EXCEPTION 'invalid_assignee' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT manager THEN
   IF NOT public.has_department_assignment(NEW.organization_id,'cleaning',NULL) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
   IF TG_OP='UPDATE' AND OLD.cleaner_id IS NOT NULL THEN
     SELECT user_id INTO old_user FROM public.cleaners WHERE id=OLD.cleaner_id AND organization_id=OLD.organization_id;
     IF old_user IS NULL OR NOT public.has_department_assignment(NEW.organization_id,'cleaning',old_user) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
   END IF;
   IF target_user IS NOT NULL AND NOT public.has_department_assignment(NEW.organization_id,'cleaning',target_user) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cleaning_assignment_guard BEFORE INSERT OR UPDATE OF cleaner_id ON public.cleaning_tasks FOR EACH ROW EXECUTE FUNCTION public.cleaning_assignment_guard();
CREATE POLICY cleaning_department_read ON public.cleaning_tasks FOR SELECT TO authenticated USING (public.has_department_assignment(organization_id,'cleaning',NULL) AND public.can_access_property(property_id));
CREATE OR REPLACE FUNCTION public.cleaning_assignment_options()
RETURNS TABLE(property_id uuid,cleaner_id uuid,full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT p.id,c.id,c.full_name FROM public.properties p JOIN public.cleaners c ON c.organization_id=p.organization_id JOIN public.organization_members m ON m.user_id=c.user_id AND m.organization_id=c.organization_id
 WHERE p.organization_id=public.active_organization_id() AND public.can_access_property(p.id) AND c.active AND m.active
 AND (public.has_organization_permission(p.organization_id,'assign_cleaning') OR public.has_department_assignment(p.organization_id,'cleaning',c.user_id)) ORDER BY p.id,c.full_name
$$;
REVOKE ALL ON FUNCTION public.cleaning_assignment_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleaning_assignment_options() TO authenticated;
CREATE OR REPLACE FUNCTION public.assign_cleaning_task(_task_id uuid,_cleaner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.cleaning_tasks;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.cleaning_tasks WHERE id=_task_id FOR UPDATE;
 IF t.id IS NULL OR t.organization_id IS DISTINCT FROM public.active_organization_id() OR NOT public.can_access_property(t.property_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT (public.has_organization_permission(t.organization_id,'assign_cleaning') OR public.has_department_assignment(t.organization_id,'cleaning',NULL)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF t.status NOT IN ('pending','accepted') THEN RAISE EXCEPTION 'assignment_locked'; END IF;
 UPDATE public.cleaning_tasks SET cleaner_id=_cleaner_id WHERE id=t.id;
END $$;
REVOKE ALL ON FUNCTION public.assign_cleaning_task(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_cleaning_task(uuid,uuid) TO authenticated;