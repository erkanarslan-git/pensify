ALTER TABLE public.cleaners ADD COLUMN time_tracking_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.cleaners.time_tracking_enabled IS 'Employee time tracking eligibility; active remains cleaning-role roster state.';
CREATE OR REPLACE FUNCTION public.sync_member_time_profile(_member uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.organization_members; v_enabled boolean; v_name text; v_email text;
BEGIN
 SELECT * INTO m FROM public.organization_members WHERE id=_member;
 IF m.id IS NULL THEN RETURN; END IF;
 v_enabled := m.active AND (m.role='cleaner' OR EXISTS (SELECT 1 FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=m.organization_id AND d.is_worker));
 IF v_enabled THEN
  SELECT COALESCE(NULLIF(p.full_name,''),split_part(u.email,'@',1),'—'),u.email INTO v_name,v_email FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=m.user_id;
  INSERT INTO public.cleaners(organization_id,user_id,full_name,email,active,time_tracking_enabled) VALUES(m.organization_id,m.user_id,COALESCE(v_name,'—'),v_email,m.role='cleaner',true)
  ON CONFLICT(user_id) DO UPDATE SET active=EXCLUDED.active,time_tracking_enabled=true WHERE cleaners.organization_id=EXCLUDED.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff belongs to another organization' USING ERRCODE='23514'; END IF;
 ELSE
  UPDATE public.cleaners SET active=false,time_tracking_enabled=false WHERE user_id=m.user_id AND organization_id=m.organization_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.sync_member_time_profile(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.sync_member_cleaner_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.sync_member_time_profile(NEW.id); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.sync_department_time_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM public.sync_member_time_profile(OLD.member_id); RETURN OLD; END IF;
 PERFORM public.sync_member_time_profile(NEW.member_id);
 IF TG_OP='UPDATE' AND OLD.member_id<>NEW.member_id THEN PERFORM public.sync_member_time_profile(OLD.member_id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_department_time_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER department_time_profile AFTER INSERT OR UPDATE OR DELETE ON public.member_departments FOR EACH ROW EXECUTE FUNCTION public.sync_department_time_profile();
DO $$ DECLARE m record; BEGIN FOR m IN SELECT id FROM public.organization_members LOOP PERFORM public.sync_member_time_profile(m.id); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.clock_start(_property_id uuid, _token text, _lat double precision, _lng double precision, _accuracy double precision, _source text DEFAULT 'qr'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); p record; v_cleaner uuid; v_dist double precision; v_id uuid; v_note text; o record;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF _token IS NOT NULL THEN SELECT * INTO p FROM public.properties WHERE qr_token=_token AND active;
 ELSE SELECT * INTO p FROM public.properties WHERE id=_property_id AND active; END IF;
 IF p.id IS NULL THEN RAISE EXCEPTION 'unknown_location'; END IF;
 IF NOT public.is_organization_member(p.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _token IS NULL AND NOT public.can_access_property(p.id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT c.id INTO v_cleaner FROM public.cleaners c JOIN public.organization_members m ON m.user_id=c.user_id AND m.organization_id=c.organization_id AND m.active
 WHERE c.user_id=v_uid AND c.organization_id=p.organization_id AND c.time_tracking_enabled
 AND (m.role='cleaner' OR EXISTS(SELECT 1 FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=m.organization_id AND d.is_worker));
 IF v_cleaner IS NULL THEN RAISE EXCEPTION 'no_staff_profile'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('clock:' || v_cleaner::text));
 SELECT * INTO o FROM public.time_entries WHERE cleaner_id=v_cleaner AND clock_out_at IS NULL;
 IF o.id IS NOT NULL THEN
  IF o.clock_in_at < now()-interval '16 hours' THEN
   UPDATE public.time_entries SET clock_out_at=clock_in_at,break_started_at=NULL,break_minutes=0,status='auto_closed',needs_review=true,review_reason='missing_clock_out' WHERE id=o.id;
  ELSIF o.property_id=p.id THEN RETURN o.id; ELSE RAISE EXCEPTION 'already_clocked_in'; END IF;
 END IF;
 IF p.latitude IS NULL OR p.longitude IS NULL THEN
  IF NOT p.clock_without_location THEN RAISE EXCEPTION 'location_not_configured'; END IF;
  v_note := 'without location (manager approved)';
 ELSE
  IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'location_required'; END IF;
  IF _accuracy IS NULL OR _accuracy>200 THEN RAISE EXCEPTION 'location_inaccurate'; END IF;
  v_dist := 2*6371000*asin(sqrt(power(sin(radians(p.latitude-_lat)/2),2)+cos(radians(_lat))*cos(radians(p.latitude))*power(sin(radians(p.longitude-_lng)/2),2)));
  IF v_dist>coalesce(p.geofence_radius_m,150)+_accuracy THEN RAISE EXCEPTION 'too_far'; END IF;
 END IF;
 INSERT INTO public.time_entries(organization_id,cleaner_id,property_id,clock_in_at,clock_in_lat,clock_in_lng,clock_in_accuracy_m,source,status,notes)
 VALUES(p.organization_id,v_cleaner,p.id,now(),_lat,_lng,_accuracy,CASE WHEN _source IN ('qr','manual') THEN _source ELSE 'qr' END,'active',v_note) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.clock_start(uuid,text,double precision,double precision,double precision,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clock_start(uuid,text,double precision,double precision,double precision,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.my_shift_context(_property_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; m public.organization_members; c public.cleaners; v_open jsonb; v_enabled boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF _property_id IS NULL THEN v_org:=public.default_organization_id();
 ELSE SELECT organization_id INTO v_org FROM public.properties WHERE id=_property_id AND active; END IF;
 IF v_org IS NULL THEN RETURN jsonb_build_object('status','no_membership','can_manage_team',false); END IF;
 SELECT om.* INTO m FROM public.organization_members om JOIN public.organizations o ON o.id=om.organization_id AND o.active WHERE om.organization_id=v_org AND om.user_id=auth.uid() AND om.active;
 IF m.id IS NULL THEN RETURN jsonb_build_object('status','no_membership','can_manage_team',false); END IF;
 SELECT * INTO c FROM public.cleaners WHERE user_id=auth.uid() AND organization_id=v_org;
 v_enabled:=COALESCE(c.time_tracking_enabled,false) AND (m.role='cleaner' OR EXISTS(SELECT 1 FROM public.member_departments d WHERE d.member_id=m.id AND d.organization_id=v_org AND d.is_worker));
 SELECT jsonb_build_object('id',e.id,'property_id',e.property_id,'clock_in_at',e.clock_in_at,'break_minutes',e.break_minutes,'break_started_at',e.break_started_at,'properties',jsonb_build_object('name',p.name)) INTO v_open FROM public.time_entries e JOIN public.properties p ON p.id=e.property_id WHERE e.cleaner_id=c.id AND e.organization_id=v_org AND e.clock_out_at IS NULL;
 RETURN jsonb_build_object('status',CASE WHEN v_enabled THEN 'employee' ELSE 'not_employee' END,'can_manage_team',public.has_organization_permission(v_org,'manage_team'),'cleaner',CASE WHEN v_enabled OR v_open IS NOT NULL THEN jsonb_build_object('id',c.id,'full_name',c.full_name) ELSE NULL END,'open',v_open);
END $$;
REVOKE ALL ON FUNCTION public.my_shift_context(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_shift_context(uuid) TO authenticated,service_role;