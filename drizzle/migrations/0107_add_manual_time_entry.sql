CREATE OR REPLACE FUNCTION public.add_manual_time_entry(_user_id uuid, _property_id uuid, _clock_in_at timestamptz, _clock_out_at timestamptz, _break_minutes integer, _overtime_minutes integer, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid := public.active_organization_id(); c record; new_id uuid; net integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF org IS NULL OR NOT public.is_organization_member(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF coalesce(length(trim(_reason)),0)<3 THEN RAISE EXCEPTION 'reason_required'; END IF;
 SELECT * INTO c FROM public.cleaners WHERE user_id=_user_id AND organization_id=org LIMIT 1;
 IF c.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=_property_id AND p.organization_id=org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT(public.is_org_admin(org) OR (public.has_organization_permission(org,'manage_time') AND public.can_access_property(_property_id)) OR (public.has_department_power(org,_user_id,'time') AND public.can_access_property(_property_id))) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _user_id=auth.uid() AND NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _clock_in_at IS NULL OR _clock_out_at IS NULL OR _clock_out_at<=_clock_in_at OR _clock_out_at>now() OR _clock_out_at-_clock_in_at>interval '24 hours' THEN RAISE EXCEPTION 'invalid_range'; END IF;
 net := round(extract(epoch FROM _clock_out_at-_clock_in_at)/60)::integer;
 IF _break_minutes IS NULL OR _break_minutes<0 OR _break_minutes>=net THEN RAISE EXCEPTION 'invalid_break'; END IF;
 net := net-_break_minutes;
 IF coalesce(_overtime_minutes,0)<0 OR coalesce(_overtime_minutes,0)>net THEN RAISE EXCEPTION 'invalid_minutes'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('clock:'||c.id::text));
 IF EXISTS(SELECT 1 FROM public.time_entries o WHERE o.organization_id=org AND o.cleaner_id=c.id AND NOT(o.needs_review AND o.clock_out_at IS NULL) AND tstzrange(o.clock_in_at,coalesce(o.clock_out_at,'infinity')) && tstzrange(_clock_in_at,_clock_out_at)) THEN RAISE EXCEPTION 'overlap'; END IF;
 INSERT INTO public.time_entries(organization_id,cleaner_id,property_id,clock_in_at,clock_out_at,break_minutes,status,source,manual_override_by,manual_override_at,notes)
 VALUES(org,c.id,_property_id,_clock_in_at,_clock_out_at,_break_minutes,'manually_adjusted','manual',auth.uid(),now(),trim(_reason)) RETURNING id INTO new_id;
 INSERT INTO public.time_entry_corrections(organization_id,time_entry_id,new_clock_in_at,new_clock_out_at,new_break_minutes,reason,changed_by)
 VALUES(org,new_id,_clock_in_at,_clock_out_at,_break_minutes,trim(_reason),auth.uid());
 IF coalesce(_overtime_minutes,0)>0 THEN PERFORM public.approve_time_entry_overtime(new_id,_overtime_minutes,_reason); END IF;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.add_manual_time_entry(uuid,uuid,timestamptz,timestamptz,integer,integer,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_manual_time_entry(uuid,uuid,timestamptz,timestamptz,integer,integer,text) TO authenticated;