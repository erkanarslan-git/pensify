ALTER TABLE public.todos ADD COLUMN assigned_to uuid;
ALTER TABLE public.todos ADD COLUMN property_id uuid REFERENCES public.properties(id);
ALTER TABLE public.todos ADD COLUMN room_id uuid REFERENCES public.rooms(id);
ALTER TABLE public.todos ADD COLUMN reservation_id uuid REFERENCES public.reservations(id);
ALTER TABLE public.todos ADD COLUMN due_at timestamptz;
ALTER TABLE public.todos ADD COLUMN recurrence text NOT NULL DEFAULT 'none' CHECK(recurrence IN('none','daily','weekly','monthly'));
ALTER TABLE public.todos ADD COLUMN recurrence_root uuid;
ALTER TABLE public.todos ADD COLUMN recurrence_period date;
ALTER TABLE public.todos ADD COLUMN archived_at timestamptz;
ALTER TABLE public.todos ADD COLUMN reminder_at timestamptz;
ALTER TABLE public.todos ADD COLUMN reminder_status text NOT NULL DEFAULT 'not_scheduled' CHECK(reminder_status IN('not_scheduled','channel_unavailable','pending','sent','error'));
CREATE UNIQUE INDEX todos_recurrence_period ON public.todos(organization_id,recurrence_root,recurrence_period) WHERE recurrence_root IS NOT NULL;
CREATE TABLE public.todo_activity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),todo_id uuid NOT NULL REFERENCES public.todos(id),actor_id uuid,kind text NOT NULL,body text,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.todo_activity TO authenticated; GRANT ALL ON public.todo_activity TO service_role;
ALTER TABLE public.todo_activity ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_read_todo(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.todos t WHERE t.id=_id AND t.organization_id=public.active_organization_id() AND public.is_organization_member(t.organization_id) AND (t.property_id IS NULL OR public.can_access_property(t.property_id)) AND (public.has_organization_role(t.organization_id,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) OR t.assigned_to=auth.uid() OR t.created_by=auth.uid())) $$;
REVOKE ALL ON FUNCTION public.can_read_todo(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.can_read_todo(uuid) TO authenticated;
CREATE POLICY todo_scoped_reads ON public.todos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_read_todo(id));
CREATE POLICY todo_activity_read ON public.todo_activity FOR SELECT TO authenticated USING(public.can_read_todo(todo_id));
REVOKE INSERT,UPDATE,DELETE ON public.todos FROM authenticated;
CREATE OR REPLACE FUNCTION public.save_general_todo(_input jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); item uuid:=nullif(_input->>'id','')::uuid; p uuid:=nullif(_input->>'property_id','')::uuid; r uuid:=nullif(_input->>'room_id','')::uuid; res uuid:=nullif(_input->>'reservation_id','')::uuid; worker uuid:=nullif(_input->>'assigned_to','')::uuid; old record; date_due date:=nullif(_input->>'due_date','')::date; time_due timestamptz:=nullif(_input->>'due_at','')::timestamptz; reminder timestamptz:=nullif(_input->>'reminder_at','')::timestamptz;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.has_organization_role(org,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF item IS NOT NULL THEN SELECT * INTO old FROM public.todos WHERE id=item FOR UPDATE; IF old.id IS NULL OR NOT public.can_read_todo(item) THEN RAISE EXCEPTION 'forbidden'; END IF; END IF;
 IF p IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties WHERE id=p AND organization_id=org AND public.can_access_property(id)) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF r IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.rooms WHERE id=r AND property_id=p AND organization_id=org) THEN RAISE EXCEPTION 'invalid_room'; END IF;
 IF res IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=res AND property_id=p AND organization_id=org AND (r IS NULL OR room_id=r)) THEN RAISE EXCEPTION 'invalid_reservation'; END IF;
 IF worker IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id=worker AND organization_id=org AND active) THEN RAISE EXCEPTION 'invalid_worker'; END IF;
 IF length(trim(coalesce(_input->>'title','')))<1 OR length(_input->>'title')>500 OR coalesce(_input->>'priority','normal') NOT IN('low','normal','high','urgent') OR coalesce(_input->>'recurrence','none') NOT IN('none','daily','weekly','monthly') THEN RAISE EXCEPTION 'invalid_todo'; END IF;
 IF time_due IS NOT NULL AND (time_due AT TIME ZONE 'Europe/Berlin')::date IS DISTINCT FROM date_due THEN RAISE EXCEPTION 'invalid_due_time'; END IF;
 IF coalesce(_input->>'recurrence','none')<>'none' AND date_due IS NULL THEN RAISE EXCEPTION 'recurrence_needs_date'; END IF;
 IF item IS NULL THEN
 INSERT INTO public.todos(organization_id,title,notes,due_date,due_at,priority,assigned_to,property_id,room_id,reservation_id,recurrence,reminder_at,reminder_status) VALUES(org,trim(_input->>'title'),_input->>'notes',date_due,time_due,coalesce(_input->>'priority','normal'),worker,p,r,res,coalesce(_input->>'recurrence','none'),reminder,CASE WHEN reminder IS NULL THEN 'not_scheduled' ELSE 'channel_unavailable' END) RETURNING id INTO item;
 ELSE UPDATE public.todos SET title=trim(_input->>'title'),notes=_input->>'notes',due_date=date_due,due_at=time_due,priority=coalesce(_input->>'priority','normal'),assigned_to=worker,property_id=p,room_id=r,reservation_id=res,recurrence=coalesce(_input->>'recurrence','none'),reminder_at=reminder,reminder_status=CASE WHEN reminder IS NULL THEN 'not_scheduled' ELSE 'channel_unavailable' END WHERE id=item; END IF;
 INSERT INTO public.todo_activity(organization_id,todo_id,actor_id,kind) VALUES(org,item,auth.uid(),CASE WHEN old.id IS NULL THEN 'created' ELSE 'updated' END);
 RETURN item;
END $$;
CREATE OR REPLACE FUNCTION public.general_todo_action(_id uuid,_action text,_note text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; next_due date; root uuid; next_id uuid;
BEGIN
 SELECT * INTO t FROM public.todos WHERE id=_id FOR UPDATE;
 IF auth.uid() IS NULL OR t.id IS NULL OR NOT public.can_read_todo(t.id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _action='note' THEN
 IF length(trim(coalesce(_note,'')))<1 OR length(_note)>4000 THEN RAISE EXCEPTION 'invalid_note'; END IF;
 INSERT INTO public.todo_activity(organization_id,todo_id,actor_id,kind,body) VALUES(t.organization_id,t.id,auth.uid(),'note',trim(_note)); RETURN;
 ELSIF _action='archive' THEN
 IF t.created_by IS DISTINCT FROM auth.uid() AND NOT public.is_org_admin(t.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.todos SET archived_at=now() WHERE id=t.id;
 ELSIF _action IN('complete','reopen') THEN
 IF (_action='complete')=t.done THEN RETURN; END IF;
 UPDATE public.todos SET done=(_action='complete') WHERE id=t.id;
 IF _action='complete' AND t.recurrence<>'none' AND t.due_date IS NOT NULL THEN
 root:=coalesce(t.recurrence_root,t.id);
 next_due:=CASE t.recurrence WHEN 'daily' THEN t.due_date+1 WHEN 'weekly' THEN t.due_date+7 ELSE (t.due_date+interval '1 month')::date END;
 INSERT INTO public.todos(organization_id,title,notes,due_date,due_at,priority,assigned_to,property_id,room_id,reservation_id,recurrence,recurrence_root,recurrence_period,reminder_at,reminder_status)
 VALUES(t.organization_id,t.title,t.notes,next_due,CASE WHEN t.due_at IS NOT NULL THEN (next_due::text||' '||to_char(t.due_at AT TIME ZONE 'Europe/Berlin','HH24:MI:SS'))::timestamp AT TIME ZONE 'Europe/Berlin' END,t.priority,t.assigned_to,t.property_id,t.room_id,t.reservation_id,t.recurrence,root,next_due,CASE WHEN t.reminder_at IS NOT NULL THEN t.reminder_at+(next_due-t.due_date)*interval '1 day' END,CASE WHEN t.reminder_at IS NULL THEN 'not_scheduled' ELSE 'channel_unavailable' END)
 ON CONFLICT(organization_id,recurrence_root,recurrence_period) WHERE recurrence_root IS NOT NULL DO NOTHING RETURNING id INTO next_id;
 IF next_id IS NOT NULL THEN INSERT INTO public.todo_activity(organization_id,todo_id,actor_id,kind) VALUES(t.organization_id,next_id,auth.uid(),'created'); END IF;
 END IF;
 ELSE RAISE EXCEPTION 'invalid_action'; END IF;
 INSERT INTO public.todo_activity(organization_id,todo_id,actor_id,kind) VALUES(t.organization_id,t.id,auth.uid(),_action);
END $$;
REVOKE ALL ON FUNCTION public.save_general_todo(jsonb),public.general_todo_action(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_general_todo(jsonb),public.general_todo_action(uuid,text,text) TO authenticated;