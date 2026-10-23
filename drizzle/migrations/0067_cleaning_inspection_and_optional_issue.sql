ALTER TABLE public.properties ADD COLUMN cleaning_inspection_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.cleaning_tasks ADD COLUMN inspection_state text NOT NULL DEFAULT 'not_required' CHECK(inspection_state IN('not_required','pending','approved','rejected'));
ALTER TABLE public.cleaning_tasks ADD COLUMN inspected_by uuid;
ALTER TABLE public.cleaning_tasks ADD COLUMN inspected_at timestamptz;
ALTER TABLE public.cleaning_tasks ADD COLUMN inspection_note text;
ALTER TABLE public.room_issues DROP CONSTRAINT room_issues_description_check;
ALTER TABLE public.room_issues ADD CONSTRAINT room_issues_description_check CHECK(length(description)<=2000);
ALTER TABLE public.room_issues DROP CONSTRAINT room_issues_category_check;
ALTER TABLE public.room_issues ADD CONSTRAINT room_issues_category_check CHECK(category IN('damage','plumbing','electric','missing','dirty','lock','other'));
CREATE OR REPLACE FUNCTION public.report_room_issue(_room_id uuid,_category text,_description text DEFAULT '',_task_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; task record; issue uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 SELECT r0.*,p.organization_id AS org INTO r FROM public.rooms r0 JOIN public.properties p ON p.id=r0.property_id WHERE r0.id=_room_id FOR UPDATE OF r0;
 IF r.id IS NULL OR r.org IS DISTINCT FROM public.active_organization_id() OR NOT public.is_organization_member(r.org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT(public.can_access_property(r.property_id) OR EXISTS(SELECT 1 FROM public.cleaning_tasks t JOIN public.cleaners c ON c.id=t.cleaner_id AND c.organization_id=t.organization_id WHERE t.room_id=r.id AND t.organization_id=r.org AND c.user_id=auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _category IS NULL OR _category NOT IN('damage','plumbing','electric','missing','dirty','lock','other') OR length(coalesce(_description,''))>2000 THEN RAISE EXCEPTION 'invalid_issue'; END IF;
 IF _task_id IS NOT NULL THEN
  SELECT * INTO task FROM public.cleaning_tasks WHERE id=_task_id AND room_id=r.id AND organization_id=r.org FOR UPDATE;
  IF task.id IS NULL THEN RAISE EXCEPTION 'invalid_task'; END IF;
 END IF;
 INSERT INTO public.room_issues(organization_id,property_id,room_id,task_id,category,description) VALUES(r.org,r.property_id,r.id,_task_id,_category,trim(coalesce(_description,''))) RETURNING id INTO issue;
 IF _task_id IS NOT NULL THEN PERFORM public.transition_cleaning_task(_task_id,'problem'); END IF;
 RETURN issue;
END $$;
REVOKE ALL ON FUNCTION public.report_room_issue(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_room_issue(uuid,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_cleaning_inspection_preference(_property uuid,_required boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record;
BEGIN
 SELECT * INTO p FROM public.properties WHERE id=_property;
 IF p.id IS NULL OR p.organization_id IS DISTINCT FROM public.active_organization_id() OR NOT public.is_organization_member(p.organization_id) OR NOT public.can_access_property(p.id) OR NOT public.has_organization_permission(p.organization_id,'manage_rooms') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _required IS NULL THEN RAISE EXCEPTION 'invalid_preference'; END IF;
 UPDATE public.properties SET cleaning_inspection_required=_required WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.set_cleaning_inspection_preference(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_cleaning_inspection_preference(uuid,boolean) TO authenticated;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.transition_cleaning_task(uuid,public.cleaning_status)'::regprocedure) INTO definition;
 definition:=replace(definition,'v_manager := public.has_organization_permission(t.organization_id, ''assign_cleaning'');','IF NOT public.is_organization_member(t.organization_id) OR t.organization_id IS DISTINCT FROM public.active_organization_id() THEN RAISE EXCEPTION ''forbidden''; END IF; v_manager := public.has_organization_permission(t.organization_id, ''assign_cleaning'') AND public.can_access_property(t.property_id);');
 definition:=replace(definition,'IF t.status = _to THEN RETURN _to; END IF;','');
 definition:=replace(definition,'v_ok := CASE','IF t.status = _to THEN RETURN _to; END IF; IF t.status=''completed'' AND _to IN (''pending'',''in_progress'') AND length(trim(coalesce(current_setting(''app.cleaning_reason'',true),'''')))<3 THEN RAISE EXCEPTION ''reason_required''; END IF; v_ok := CASE');
 definition:=replace(definition,'completed_at = CASE WHEN _to = ''completed'' THEN now() ELSE NULL END','completed_at = CASE WHEN _to = ''completed'' THEN now() ELSE NULL END, inspection_state=CASE WHEN _to=''completed'' AND (SELECT cleaning_inspection_required FROM public.properties WHERE id=t.property_id AND organization_id=t.organization_id) THEN ''pending'' ELSE ''not_required'' END, inspected_by=NULL, inspected_at=NULL, inspection_note=CASE WHEN t.status=''completed'' THEN current_setting(''app.cleaning_reason'',true) END');
 definition:=replace(definition,'UPDATE public.rooms SET status = v_room WHERE id = t.room_id;','UPDATE public.rooms SET status=CASE WHEN status=''maintenance'' OR EXISTS(SELECT 1 FROM public.room_issues i WHERE i.room_id=t.room_id AND i.organization_id=t.organization_id AND i.status=''open'') THEN ''maintenance''::public.room_status WHEN _to=''completed'' AND (SELECT cleaning_inspection_required FROM public.properties WHERE id=t.property_id) THEN ''cleaning_required''::public.room_status ELSE v_room END WHERE id=t.room_id AND organization_id=t.organization_id;');
 EXECUTE definition;
END $$;
CREATE OR REPLACE FUNCTION public.review_cleaning_task(_task_id uuid,_approved boolean,_reason text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record;
BEGIN
 SELECT * INTO t FROM public.cleaning_tasks WHERE id=_task_id FOR UPDATE;
 IF auth.uid() IS NULL OR t.id IS NULL OR t.organization_id IS DISTINCT FROM public.active_organization_id() OR NOT public.is_organization_member(t.organization_id) OR NOT public.can_access_property(t.property_id) OR NOT public.has_organization_permission(t.organization_id,'assign_cleaning') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF t.status<>'completed' OR t.inspection_state<>'pending' OR _approved IS NULL THEN RAISE EXCEPTION 'invalid_transition'; END IF;
 IF NOT _approved AND length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'reason_required'; END IF;
 UPDATE public.cleaning_tasks SET inspection_state=CASE WHEN _approved THEN 'approved' ELSE 'rejected' END,inspected_by=auth.uid(),inspected_at=now(),inspection_note=trim(coalesce(_reason,'')),status=CASE WHEN _approved THEN status ELSE 'pending' END WHERE id=t.id;
 UPDATE public.rooms SET status=CASE WHEN status='maintenance' OR EXISTS(SELECT 1 FROM public.room_issues i WHERE i.room_id=t.room_id AND i.organization_id=t.organization_id AND i.status='open') THEN 'maintenance'::public.room_status WHEN _approved THEN 'cleaned'::public.room_status ELSE 'cleaning_required'::public.room_status END WHERE id=t.room_id AND organization_id=t.organization_id;
END $$;
REVOKE ALL ON FUNCTION public.review_cleaning_task(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_cleaning_task(uuid,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.reopen_cleaning_task(_task_id uuid,_to public.cleaning_status,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _to NOT IN('pending','in_progress') OR length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'reason_required'; END IF;
 PERFORM set_config('app.cleaning_reason',_reason,true);
 PERFORM public.transition_cleaning_task(_task_id,_to);
 PERFORM set_config('app.cleaning_reason','',true);
END $$;
REVOKE ALL ON FUNCTION public.reopen_cleaning_task(uuid,public.cleaning_status,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reopen_cleaning_task(uuid,public.cleaning_status,text) TO authenticated;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.tv_snapshot_v2(text)'::regprocedure) INTO definition;
 IF position('FROM cleaning_jobs WHERE status=''problem''' IN definition)=0 THEN RAISE EXCEPTION 'unexpected_tv_review'; END IF;
 definition:=replace(definition,'FROM cleaning_jobs WHERE status=''problem''','FROM cleaning_jobs WHERE inspection_state=''pending'''); EXECUTE definition;
END $$;
COMMENT ON FUNCTION public.tv_snapshot_v2(text) IS 'Strict anonymous org summary. Review means pending cleaning inspection; problems remain maintenance. No personal data.';