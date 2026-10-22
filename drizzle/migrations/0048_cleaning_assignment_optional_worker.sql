CREATE OR REPLACE FUNCTION public.assign_cleaning_task(_task_id uuid,_cleaner_id uuid DEFAULT NULL)
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