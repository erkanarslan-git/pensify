ALTER TABLE public.todos ADD COLUMN department text CHECK (department IN ('office','cleaning','maintenance'));
CREATE INDEX todos_org_department_idx ON public.todos(organization_id, department) WHERE department IS NOT NULL;
GRANT SELECT (department) ON public.todos TO authenticated;
ALTER TABLE public.member_departments ADD COLUMN lead_can_reset_password boolean NOT NULL DEFAULT false;
GRANT SELECT (lead_can_reset_password), UPDATE (lead_can_reset_password), INSERT (lead_can_reset_password) ON public.member_departments TO authenticated;

CREATE OR REPLACE FUNCTION public.is_department_lead(_org uuid, _department text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id
  WHERE d.organization_id=_org AND m.organization_id=_org AND m.user_id=auth.uid() AND m.active AND d.department=_department AND d.is_lead)
$$;
CREATE OR REPLACE FUNCTION public.is_department_worker(_org uuid, _department text, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT _user IS NOT NULL AND EXISTS (SELECT 1 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id
  WHERE d.organization_id=_org AND m.organization_id=_org AND m.user_id=_user AND m.active AND d.department=_department AND (d.is_worker OR d.is_lead))
$$;

CREATE OR REPLACE FUNCTION public.can_read_todo(_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS(SELECT 1 FROM public.todos t WHERE t.id=_id AND t.organization_id=public.active_organization_id() AND public.is_organization_member(t.organization_id) AND (t.property_id IS NULL OR public.can_access_property(t.property_id)) AND (public.has_organization_role(t.organization_id,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) OR t.assigned_to=auth.uid() OR t.created_by=auth.uid() OR (t.department IS NOT NULL AND public.is_department_lead(t.organization_id,t.department)))) $function$;

CREATE POLICY todo_scoped_updates ON public.todos AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_read_todo(id)) WITH CHECK (public.can_read_todo(id));

CREATE OR REPLACE FUNCTION public.my_todo_departments()
RETURNS TABLE(department text, is_lead boolean, members uuid[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT d.department, bool_or(d.is_lead),
  CASE WHEN bool_or(d.is_lead) THEN (SELECT array_agg(DISTINCT tm.user_id) FROM public.member_departments w JOIN public.organization_members tm ON tm.id=w.member_id
    WHERE w.organization_id=public.active_organization_id() AND w.department=d.department AND tm.active AND (w.is_worker OR w.is_lead)) ELSE ARRAY[auth.uid()] END
 FROM public.member_departments d JOIN public.organization_members m ON m.id=d.member_id
 WHERE d.organization_id=public.active_organization_id() AND m.user_id=auth.uid() AND m.active AND d.department IN ('office','cleaning','maintenance') AND (d.is_worker OR d.is_lead)
 GROUP BY d.department
$$;
REVOKE EXECUTE ON FUNCTION public.my_todo_departments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_todo_departments() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_reset_member_password(_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND _target IS DISTINCT FROM auth.uid() AND EXISTS (
  SELECT 1 FROM public.member_departments l JOIN public.organization_members lm ON lm.id=l.member_id
  JOIN public.member_departments w ON w.department=l.department AND w.organization_id=l.organization_id
  JOIN public.organization_members tm ON tm.id=w.member_id
  WHERE l.organization_id=public.active_organization_id() AND lm.user_id=auth.uid() AND lm.active AND l.is_lead AND l.lead_can_reset_password
   AND l.department IN ('office','cleaning','maintenance') AND tm.user_id=_target AND tm.active AND w.is_worker
   AND tm.role NOT IN ('owner','admin'))
  AND NOT EXISTS (SELECT 1 FROM public.organization_members x WHERE x.user_id=_target AND x.organization_id<>public.active_organization_id())
$$;
REVOKE EXECUTE ON FUNCTION public.can_reset_member_password(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_reset_member_password(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_general_todo(_input jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE org uuid:=public.active_organization_id(); item uuid:=nullif(_input->>'id','')::uuid; p uuid:=nullif(_input->>'property_id','')::uuid; r uuid:=nullif(_input->>'room_id','')::uuid; res uuid:=nullif(_input->>'reservation_id','')::uuid; worker uuid:=nullif(_input->>'assigned_to','')::uuid; old record; date_due date:=nullif(_input->>'due_date','')::date; time_due timestamptz:=nullif(_input->>'due_at','')::timestamptz; reminder timestamptz:=nullif(_input->>'reminder_at','')::timestamptz; dept text:=nullif(_input->>'department',''); office boolean;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 office:=public.has_organization_role(org,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]);
 IF dept IS NOT NULL AND dept NOT IN ('office','cleaning','maintenance') THEN RAISE EXCEPTION 'invalid_todo'; END IF;
 IF NOT office THEN
  -- Department members: leads assign within their department; workers only note things for themselves.
  IF dept IS NULL OR NOT public.is_department_worker(org,dept,auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.is_department_lead(org,dept) THEN
   IF worker IS NOT NULL AND NOT public.is_department_worker(org,dept,worker) THEN RAISE EXCEPTION 'invalid_worker'; END IF;
  ELSIF worker IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
 END IF;
 SELECT * INTO old FROM public.todos WHERE id=item FOR UPDATE; IF item IS NOT NULL THEN IF old.id IS NULL OR NOT public.can_read_todo(item) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT office AND old.created_by IS DISTINCT FROM auth.uid() AND NOT (old.department IS NOT NULL AND public.is_department_lead(org,old.department)) THEN RAISE EXCEPTION 'forbidden'; END IF; END IF;
 IF p IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p AND organization_id=org AND public.can_access_property(id)) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF r IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rooms WHERE id=r AND property_id=p AND organization_id=org) THEN RAISE EXCEPTION 'invalid_room'; END IF;
 IF res IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=res AND property_id=p AND organization_id=org AND (r IS NULL OR room_id=r)) THEN RAISE EXCEPTION 'invalid_reservation'; END IF;
 IF worker IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id=worker AND organization_id=org AND active) THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 IF length(trim(coalesce(_input->>'title','')))<1 OR length(_input->>'title')>500 OR coalesce(_input->>'priority','normal') NOT IN('low','normal','high','urgent') OR coalesce(_input->>'recurrence','none') NOT IN('none','daily','weekly','monthly') THEN RAISE EXCEPTION 'invalid_todo'; END IF;
 IF time_due IS NOT NULL AND (time_due AT TIME ZONE 'Europe/Berlin')::date IS DISTINCT FROM date_due THEN RAISE EXCEPTION 'invalid_due_time'; END IF;
 IF coalesce(_input->>'recurrence','none')<>'none' AND date_due IS NULL THEN RAISE EXCEPTION 'recurrence_needs_date'; END IF;
 IF item IS NULL THEN
 INSERT INTO public.todos(organization_id,title,notes,due_date,due_at,priority,assigned_to,property_id,room_id,reservation_id,recurrence,reminder_at,reminder_status,department) VALUES(org,trim(_input->>'title'),_input->>'notes',date_due,time_due,coalesce(_input->>'priority','normal'),worker,p,r,res,coalesce(_input->>'recurrence','none'),reminder,CASE WHEN reminder IS NULL THEN 'not_scheduled' ELSE 'channel_unavailable' END,dept) RETURNING id INTO item;
 ELSE UPDATE public.todos SET title=trim(_input->>'title'),notes=_input->>'notes',due_date=date_due,due_at=time_due,priority=coalesce(_input->>'priority','normal'),assigned_to=worker,property_id=p,room_id=r,reservation_id=res,recurrence=coalesce(_input->>'recurrence','none'),reminder_at=reminder,reminder_status=CASE WHEN reminder IS NULL THEN 'not_scheduled' ELSE 'channel_unavailable' END,department=dept WHERE id=item; END IF;
 INSERT INTO public.todo_activity(organization_id,todo_id,actor_id,kind) VALUES(org,item,auth.uid(),CASE WHEN old.id IS NULL THEN 'created' ELSE 'updated' END);
 RETURN item;
END $function$;

CREATE OR REPLACE FUNCTION public.copy_todo_department() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.recurrence_root IS NOT NULL AND NEW.department IS NULL THEN SELECT department INTO NEW.department FROM public.todos WHERE id=NEW.recurrence_root; END IF; RETURN NEW; END $$;
CREATE TRIGGER todos_copy_department BEFORE INSERT ON public.todos FOR EACH ROW EXECUTE FUNCTION public.copy_todo_department();