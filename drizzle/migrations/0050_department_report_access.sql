CREATE OR REPLACE FUNCTION public.my_report_teams() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN m.role='owner' OR EXISTS(SELECT 1 FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=m.organization_id AND d.department='hr') THEN ARRAY['all','cleaning','office','maintenance']::text[] ELSE ARRAY(SELECT d.department FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=m.organization_id AND d.is_lead AND d.lead_can_report AND d.department IN ('cleaning','office','maintenance') ORDER BY d.department) END
 FROM public.organization_members m JOIN public.organizations o ON o.id=m.organization_id AND o.active WHERE m.organization_id=public.active_organization_id() AND m.user_id=auth.uid() AND m.active
$$;
REVOKE ALL ON FUNCTION public.my_report_teams() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_report_teams() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.department_work_report(_from date,_to date,_property uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); teams text[]:=public.my_report_teams(); is_owner boolean; start_at timestamptz; end_at timestamptz; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR coalesce(cardinality(teams),0)=0 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _from IS NULL OR _to IS NULL OR _from>_to OR _to-_from>92 THEN RAISE EXCEPTION 'invalid_range'; END IF;
 SELECT m.role='owner' INTO is_owner FROM public.organization_members m WHERE m.organization_id=org AND m.user_id=auth.uid() AND m.active;
 IF _property IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=_property AND p.organization_id=org AND (is_owner OR public.can_access_property(p.id))) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 start_at:=_from::timestamp AT TIME ZONE 'Europe/Berlin'; end_at:=(_to+1)::timestamp AT TIME ZONE 'Europe/Berlin';
 WITH allowed_properties AS (
 SELECT p.id,p.name FROM public.properties p WHERE p.organization_id=org AND (is_owner OR public.can_access_property(p.id))
 ), records AS (
 SELECT r.id,'res_new'::text topic,'reservation'::text kind,r.created_at at,r.property_id,r.room_id,r.created_by staff_id,NULL::uuid reporter_id,NULL::uuid resolver_id,r.status::text status,r.channel::text source,r.guest_name title,r.notes note,NULL::text staff_fallback
 FROM public.reservations r JOIN allowed_properties p ON p.id=r.property_id WHERE 'office'=ANY(teams) AND r.organization_id=org AND r.deleted_at IS NULL AND r.created_at>=start_at AND r.created_at<end_at AND (_property IS NULL OR r.property_id=_property)
 UNION ALL
 SELECT r.id,'res_cancelled','reservation',r.updated_at,r.property_id,r.room_id,r.created_by,NULL::uuid,NULL::uuid,r.status::text,r.channel::text,r.guest_name,r.notes,NULL::text
 FROM public.reservations r JOIN allowed_properties p ON p.id=r.property_id WHERE 'office'=ANY(teams) AND r.organization_id=org AND r.deleted_at IS NULL AND r.status='cancelled' AND r.updated_at>=start_at AND r.updated_at<end_at AND (_property IS NULL OR r.property_id=_property)
 UNION ALL
 SELECT t.id,CASE WHEN t.status='completed' THEN 'clean_done' WHEN t.status='problem' THEN 'clean_review' ELSE 'clean_open' END,'cleaning',CASE WHEN t.status='completed' THEN t.completed_at ELSE t.due_at END,t.property_id,t.room_id,c.user_id,NULL::uuid,NULL::uuid,t.status::text,'app',rm.number,t.notes,c.full_name
 FROM public.cleaning_tasks t JOIN allowed_properties p ON p.id=t.property_id JOIN public.rooms rm ON rm.id=t.room_id AND rm.organization_id=org LEFT JOIN public.cleaners c ON c.id=t.cleaner_id AND c.organization_id=org
 WHERE 'cleaning'=ANY(teams) AND t.organization_id=org AND (_property IS NULL OR t.property_id=_property) AND ((t.status='completed' AND t.completed_at>=start_at AND t.completed_at<end_at) OR (t.status IN ('pending','accepted','in_progress','problem') AND t.due_at<end_at))
 UNION ALL
 SELECT i.id,CASE WHEN i.status='resolved' THEN 'issue_done' ELSE 'issue_open' END,'issue',CASE WHEN i.status='resolved' THEN i.resolved_at ELSE i.created_at END,i.property_id,i.room_id,CASE WHEN i.status='resolved' THEN i.resolved_by ELSE NULL END,i.reported_by,i.resolved_by,i.status,i.category,i.description,i.resolution_note,NULL::text
 FROM public.room_issues i JOIN allowed_properties p ON p.id=i.property_id WHERE 'maintenance'=ANY(teams) AND i.organization_id=org AND (_property IS NULL OR i.property_id=_property) AND (i.status<>'resolved' OR (i.resolved_at>=start_at AND i.resolved_at<end_at))
 UNION ALL
 SELECT t.id,CASE WHEN t.done THEN 'todo_done' WHEN t.due_date<(now() AT TIME ZONE 'Europe/Berlin')::date THEN 'todo_overdue' ELSE 'todo_open' END,'todo',CASE WHEN t.done THEN t.done_at ELSE coalesce(t.due_date::timestamp AT TIME ZONE 'Europe/Berlin',t.created_at) END,NULL::uuid,NULL::uuid,CASE WHEN t.done THEN t.done_by ELSE t.created_by END,NULL::uuid,NULL::uuid,CASE WHEN t.done THEN 'done' ELSE 'open' END,t.priority,t.title,t.notes,NULL::text
 FROM public.todos t WHERE 'office'=ANY(teams) AND t.organization_id=org AND _property IS NULL AND (NOT t.done OR (t.done_at>=start_at AND t.done_at<end_at))
 ), limited AS (SELECT * FROM records ORDER BY at DESC NULLS LAST,id,topic LIMIT 5000), normalized AS (
 SELECT jsonb_build_object('id',r.id,'topic',r.topic,'kind',r.kind,'at',r.at,'day',CASE WHEN r.topic IN ('res_new','res_cancelled','clean_done','issue_done','todo_done') THEN (r.at AT TIME ZONE 'Europe/Berlin')::date ELSE NULL END,'propertyId',r.property_id,'propertyName',p.name,'room',rm.number,'staffId',r.staff_id,'staff',coalesce(nullif(trim(s.full_name),''),nullif(trim(r.staff_fallback),'')),'reporterId',r.reporter_id,'reporter',rp.full_name,'resolverId',r.resolver_id,'resolver',rv.full_name,'status',r.status,'source',r.source,'title',r.title,'note',r.note) item
 FROM limited r LEFT JOIN allowed_properties p ON p.id=r.property_id LEFT JOIN public.rooms rm ON rm.id=r.room_id AND rm.organization_id=org
 LEFT JOIN public.profiles s ON s.id=r.staff_id LEFT JOIN public.profiles rp ON rp.id=r.reporter_id LEFT JOIN public.profiles rv ON rv.id=r.resolver_id
 ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(item) FROM normalized),'[]'::jsonb),'properties',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) ORDER BY p.name) FROM allowed_properties p),'[]'::jsonb),'allowedTeams',to_jsonb(teams),'truncated',(SELECT count(*)>5000 FROM records)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.department_work_report(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.department_work_report(date,date,uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.department_work_report(date,date,uuid) IS 'Read-only work reports: caller-resolved organization, granted departments and accessible properties. Does not widen source-table read policies.';