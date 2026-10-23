CREATE TABLE public.attendance_review_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 warning_after_minutes integer NOT NULL DEFAULT 720 CHECK(warning_after_minutes BETWEEN 60 AND 10080),
 review_after_minutes integer NOT NULL DEFAULT 960 CHECK(review_after_minutes BETWEEN 60 AND 10080),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(review_after_minutes>=warning_after_minutes)
);
GRANT SELECT,INSERT,UPDATE ON public.attendance_review_settings TO authenticated;
GRANT ALL ON public.attendance_review_settings TO service_role;
ALTER TABLE public.attendance_review_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_settings_admin ON public.attendance_review_settings FOR ALL TO authenticated USING(organization_id=public.active_organization_id() AND public.is_org_admin(organization_id)) WITH CHECK(organization_id=public.active_organization_id() AND public.is_org_admin(organization_id));
COMMENT ON TABLE public.attendance_review_settings IS 'Operational alert thresholds only; not legal hours, overtime approval or wage rules.';
CREATE UNIQUE INDEX time_entries_one_active_per_employee ON public.time_entries(organization_id,cleaner_id) WHERE clock_out_at IS NULL AND NOT needs_review;
DROP INDEX public.time_entries_one_open_per_cleaner;
DROP POLICY IF EXISTS time_entries_self_open_read ON public.time_entries;
CREATE POLICY time_entries_self_open_read ON public.time_entries FOR SELECT TO authenticated USING(clock_out_at IS NULL AND NOT needs_review AND public.is_organization_member(organization_id) AND EXISTS(SELECT 1 FROM public.cleaners c WHERE c.id=cleaner_id AND c.organization_id=time_entries.organization_id AND c.user_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.review_stale_shifts() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org record; changed integer; total integer:=0; run_id uuid;
BEGIN
 FOR org IN SELECT o.id,coalesce(s.review_after_minutes,960) AS threshold FROM public.organizations o LEFT JOIN public.attendance_review_settings s ON s.organization_id=o.id WHERE o.active LOOP
  INSERT INTO public.cron_executions(organization_id,job,status,started_at) VALUES(org.id,'review_stale_shifts','running',now()) RETURNING id INTO run_id;
  BEGIN
   UPDATE public.time_entries SET needs_review=true,review_reason='missing_clock_out',status='auto_closed'
   WHERE organization_id=org.id AND clock_out_at IS NULL AND NOT needs_review AND clock_in_at<=now()-make_interval(mins=>org.threshold);
   GET DIAGNOSTICS changed=ROW_COUNT; total:=total+changed;
   UPDATE public.cron_executions SET status='success',finished_at=now(),detail=jsonb_build_object('reviewed',changed,'threshold_minutes',org.threshold) WHERE id=run_id;
  EXCEPTION WHEN OTHERS THEN
   UPDATE public.cron_executions SET status='error',finished_at=now(),detail=jsonb_build_object('code',SQLSTATE) WHERE id=run_id;
  END;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.review_stale_shifts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_stale_shifts() TO service_role;
CREATE OR REPLACE FUNCTION public.clock_start(_property_id uuid,_token text,_lat double precision,_lng double precision,_accuracy double precision,_source text DEFAULT 'qr') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); p record; v_cleaner uuid; v_dist double precision; v_id uuid; v_note text; o record; threshold integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF _token IS NOT NULL THEN SELECT * INTO p FROM public.properties WHERE qr_token=_token AND active; ELSE SELECT * INTO p FROM public.properties WHERE id=_property_id AND active; END IF;
 IF p.id IS NULL THEN RAISE EXCEPTION 'unknown_location'; END IF;
 IF NOT public.is_organization_member(p.organization_id) OR (_token IS NULL AND NOT public.can_access_property(p.id)) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT c.id INTO v_cleaner FROM public.cleaners c JOIN public.organization_members m ON m.user_id=c.user_id AND m.organization_id=c.organization_id AND m.active WHERE c.user_id=v_uid AND c.organization_id=p.organization_id AND c.time_tracking_enabled AND (m.role='cleaner' OR EXISTS(SELECT 1 FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=m.organization_id AND d.is_worker));
 IF v_cleaner IS NULL THEN RAISE EXCEPTION 'no_staff_profile'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('clock:'||v_cleaner::text));
 SELECT coalesce((SELECT review_after_minutes FROM public.attendance_review_settings WHERE organization_id=p.organization_id),960) INTO threshold;
 SELECT * INTO o FROM public.time_entries WHERE cleaner_id=v_cleaner AND organization_id=p.organization_id AND clock_out_at IS NULL AND NOT needs_review FOR UPDATE;
 IF o.id IS NOT NULL THEN
  IF o.clock_in_at<=now()-make_interval(mins=>threshold) THEN UPDATE public.time_entries SET status='auto_closed',needs_review=true,review_reason='missing_clock_out' WHERE id=o.id;
  ELSIF o.property_id=p.id THEN RETURN o.id; ELSE RAISE EXCEPTION 'already_clocked_in'; END IF;
 END IF;
 IF p.latitude IS NULL OR p.longitude IS NULL THEN
  IF NOT p.clock_without_location THEN RAISE EXCEPTION 'location_not_configured'; END IF;
  v_note:='without location (manager approved)';
 ELSE
  IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'location_required'; END IF;
  IF _accuracy IS NULL OR _accuracy<0 OR _accuracy>200 OR NOT(_lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'location_inaccurate'; END IF;
  v_dist:=2*6371000*asin(sqrt(least(1.0,power(sin(radians(p.latitude-_lat)/2),2)+cos(radians(_lat))*cos(radians(p.latitude))*power(sin(radians(p.longitude-_lng)/2),2))));
  IF v_dist>coalesce(p.geofence_radius_m,150)+_accuracy THEN RAISE EXCEPTION 'too_far'; END IF;
 END IF;
 INSERT INTO public.time_entries(organization_id,cleaner_id,property_id,clock_in_at,clock_in_lat,clock_in_lng,clock_in_accuracy_m,source,status,notes) VALUES(p.organization_id,v_cleaner,p.id,now(),_lat,_lng,_accuracy,CASE WHEN _source IN('qr','manual') THEN _source ELSE 'qr' END,'active',v_note) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.clock_start(uuid,text,double precision,double precision,double precision,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clock_start(uuid,text,double precision,double precision,double precision,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.clock_start_for_task(_task_id uuid,_lat double precision,_lng double precision,_accuracy double precision) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; p record; c uuid; entry uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 SELECT * INTO t FROM public.cleaning_tasks WHERE id=_task_id;
 IF t.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT id INTO c FROM public.cleaners WHERE user_id=auth.uid() AND organization_id=t.organization_id AND active AND time_tracking_enabled;
 IF c IS NULL OR t.cleaner_id IS DISTINCT FROM c OR NOT public.is_organization_member(t.organization_id) OR NOT public.has_organization_permission(t.organization_id,'do_cleaning') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=t.property_id AND organization_id=t.organization_id AND active;
 IF p.id IS NULL THEN RAISE EXCEPTION 'unknown_location'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('clock:'||c::text));
 UPDATE public.time_entries SET status='auto_closed',needs_review=true,review_reason='missing_clock_out' WHERE cleaner_id=c AND organization_id=t.organization_id AND clock_out_at IS NULL AND NOT needs_review AND clock_in_at<=now()-make_interval(mins=>coalesce((SELECT review_after_minutes FROM public.attendance_review_settings WHERE organization_id=t.organization_id),960));
 SELECT id INTO entry FROM public.time_entries WHERE cleaner_id=c AND organization_id=t.organization_id AND clock_out_at IS NULL AND NOT needs_review;
 IF entry IS NOT NULL THEN RETURN entry; END IF;
 RETURN public.clock_start(p.id,p.qr_token,_lat,_lng,_accuracy,'qr');
END $$;
REVOKE ALL ON FUNCTION public.clock_start_for_task(uuid,double precision,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clock_start_for_task(uuid,double precision,double precision,double precision) TO authenticated;
CREATE OR REPLACE FUNCTION public.clock_stop(_entry_id uuid,_lat double precision,_lng double precision) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; p record; dist double precision; threshold integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id=t.cleaner_id AND c.organization_id=t.organization_id WHERE t.id=_entry_id AND c.user_id=auth.uid() AND public.is_organization_member(t.organization_id) FOR UPDATE OF t;
 IF e.id IS NULL OR e.needs_review THEN RAISE EXCEPTION 'no_open_shift'; END IF;
 IF e.clock_out_at IS NOT NULL THEN IF e.clock_out_at>now()-interval '5 minutes' THEN RETURN; END IF; RAISE EXCEPTION 'no_open_shift'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=e.property_id AND organization_id=e.organization_id;
 IF p.id IS NULL THEN RAISE EXCEPTION 'unknown_location'; END IF;
 IF p.latitude IS NULL OR p.longitude IS NULL THEN IF NOT coalesce(p.clock_without_location,false) THEN RAISE EXCEPTION 'location_not_configured'; END IF;
 ELSE
  IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'location_required'; END IF;
  IF NOT(_lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'location_inaccurate'; END IF;
  dist:=2*6371000*asin(sqrt(least(1.0,power(sin(radians(p.latitude-_lat)/2),2)+cos(radians(_lat))*cos(radians(p.latitude))*power(sin(radians(p.longitude-_lng)/2),2))));
  IF dist>coalesce(p.geofence_radius_m,150) THEN RAISE EXCEPTION 'too_far'; END IF;
 END IF;
 threshold:=coalesce((SELECT review_after_minutes FROM public.attendance_review_settings WHERE organization_id=e.organization_id),960);
 UPDATE public.time_entries SET clock_out_at=now(),clock_out_lat=_lat,clock_out_lng=_lng,break_minutes=coalesce(break_minutes,0)+CASE WHEN break_started_at IS NOT NULL THEN greatest(0,round(extract(epoch FROM now()-break_started_at)/60))::int ELSE 0 END,break_started_at=NULL,status='completed',needs_review=(now()-clock_in_at>=make_interval(mins=>threshold)),review_reason=CASE WHEN now()-clock_in_at>=make_interval(mins=>threshold) THEN 'too_long' END WHERE id=e.id;
END $$;
REVOKE ALL ON FUNCTION public.clock_stop(uuid,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clock_stop(uuid,double precision,double precision) TO authenticated;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.clock_break_start(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'e.clock_out_at IS NOT NULL','e.clock_out_at IS NOT NULL OR e.needs_review'); EXECUTE definition;
 SELECT pg_get_functiondef('public.clock_break_end(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'e.clock_out_at IS NOT NULL','e.clock_out_at IS NOT NULL OR e.needs_review'); EXECUTE definition;
 SELECT pg_get_functiondef('public.my_shift_context(uuid)'::regprocedure) INTO definition;
 IF position('e.clock_out_at IS NULL' IN definition)=0 THEN RAISE EXCEPTION 'unexpected_shift_context'; END IF;
 definition:=replace(definition,'e.clock_out_at IS NULL','e.clock_out_at IS NULL AND NOT e.needs_review');
 definition:=replace(definition,'''requires_exit_location'',p.latitude IS NOT NULL AND p.longitude IS NOT NULL','''requires_exit_location'',p.latitude IS NOT NULL AND p.longitude IS NOT NULL,''warning_after_minutes'',coalesce((SELECT warning_after_minutes FROM public.attendance_review_settings WHERE organization_id=v_org),720)'); EXECUTE definition;
 SELECT pg_get_functiondef('public.employee_attendance_board(date,date,uuid)'::regprocedure) INTO definition;
 IF position('(e.clock_in_at AT TIME ZONE ''Europe/Berlin'')::date BETWEEN _from AND _to' IN definition)=0 THEN RAISE EXCEPTION 'unexpected_attendance_board'; END IF;
 definition:=replace(definition,'(e.clock_in_at AT TIME ZONE ''Europe/Berlin'')::date BETWEEN _from AND _to','e.clock_in_at < ((_to+1)::timestamp AT TIME ZONE ''Europe/Berlin'') AND coalesce(e.clock_out_at,now()) > (_from::timestamp AT TIME ZONE ''Europe/Berlin'')');
 definition:=replace(definition,'''needs_review'',e.needs_review','''needs_review'',e.needs_review,''status'',e.status,''review_reason'',e.review_reason'); EXECUTE definition;
END $$;
CREATE OR REPLACE FUNCTION public.correct_time_entry(_entry_id uuid,_clock_in_at timestamptz,_clock_out_at timestamptz,_break_minutes integer,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF coalesce(length(trim(_reason)),0)<3 THEN RAISE EXCEPTION 'reason_required'; END IF;
 SELECT * INTO e FROM public.time_entries WHERE id=_entry_id;
 IF e.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT public.is_organization_member(e.organization_id) OR e.organization_id IS DISTINCT FROM public.active_organization_id() OR NOT(public.is_org_admin(e.organization_id) OR (public.has_organization_permission(e.organization_id,'manage_time') AND public.can_access_property(e.property_id)) OR (public.has_department_power(e.organization_id,public.cleaner_user(e.cleaner_id),'time') AND public.can_access_property(e.property_id))) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF public.cleaner_user(e.cleaner_id)=auth.uid() AND NOT public.is_org_admin(e.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('clock:'||e.cleaner_id::text));
 SELECT * INTO e FROM public.time_entries WHERE id=_entry_id FOR UPDATE;
 IF _clock_in_at IS NULL OR _clock_in_at>now() OR (_clock_out_at IS NOT NULL AND (_clock_out_at<=_clock_in_at OR _clock_out_at>now())) THEN RAISE EXCEPTION 'invalid_range'; END IF;
 IF e.needs_review AND _clock_out_at IS NULL THEN RAISE EXCEPTION 'missing_clock_out'; END IF;
 IF _break_minutes IS NULL OR _break_minutes<0 OR (_clock_out_at IS NOT NULL AND _break_minutes>extract(epoch FROM _clock_out_at-_clock_in_at)/60) THEN RAISE EXCEPTION 'invalid_break'; END IF;
 IF EXISTS(SELECT 1 FROM public.time_entries o WHERE o.organization_id=e.organization_id AND o.cleaner_id=e.cleaner_id AND o.id<>e.id AND NOT(o.needs_review AND o.clock_out_at IS NULL) AND tstzrange(o.clock_in_at,coalesce(o.clock_out_at,'infinity')) && tstzrange(_clock_in_at,coalesce(_clock_out_at,'infinity'))) THEN RAISE EXCEPTION 'overlap'; END IF;
 PERFORM set_config('app.correction_reason',_reason,true);
 UPDATE public.time_entries SET clock_in_at=_clock_in_at,clock_out_at=_clock_out_at,break_minutes=_break_minutes,break_started_at=CASE WHEN _clock_out_at IS NULL THEN break_started_at END,status=CASE WHEN _clock_out_at IS NULL THEN status ELSE 'manually_adjusted' END,needs_review=false,review_reason=NULL,manual_override_by=auth.uid(),manual_override_at=now(),notes=coalesce(notes||' · ','')||_reason WHERE id=e.id;
 PERFORM set_config('app.correction_reason','',true);
END $$;
REVOKE ALL ON FUNCTION public.correct_time_entry(uuid,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_time_entry(uuid,timestamptz,timestamptz,integer,text) TO authenticated;