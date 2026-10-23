CREATE OR REPLACE FUNCTION public.clock_stop(_entry_id uuid, _lat double precision, _lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record; p record; dist double precision;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id=t.cleaner_id AND c.organization_id=t.organization_id
 WHERE t.id=_entry_id AND c.user_id=auth.uid() AND public.is_organization_member(t.organization_id) FOR UPDATE OF t;
 IF e.id IS NULL THEN RAISE EXCEPTION 'no_open_shift'; END IF;
 IF e.clock_out_at IS NOT NULL THEN
  IF e.clock_out_at>now()-interval '5 minutes' THEN RETURN; END IF;
  RAISE EXCEPTION 'no_open_shift';
 END IF;
 SELECT * INTO p FROM public.properties WHERE id=e.property_id AND organization_id=e.organization_id;
 IF p.id IS NULL THEN RAISE EXCEPTION 'unknown_location'; END IF;
 IF p.latitude IS NULL OR p.longitude IS NULL THEN
  IF NOT coalesce(p.clock_without_location,false) THEN RAISE EXCEPTION 'location_not_configured'; END IF;
 ELSE
  IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'location_required'; END IF;
  IF NOT (_lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'location_inaccurate'; END IF;
  dist:=2*6371000*asin(sqrt(least(1.0,power(sin(radians(p.latitude-_lat)/2),2)+cos(radians(_lat))*cos(radians(p.latitude))*power(sin(radians(p.longitude-_lng)/2),2))));
  IF dist>coalesce(p.geofence_radius_m,150) THEN RAISE EXCEPTION 'too_far'; END IF;
 END IF;
 UPDATE public.time_entries SET clock_out_at=now(),clock_out_lat=_lat,clock_out_lng=_lng,
 break_minutes=coalesce(break_minutes,0)+CASE WHEN break_started_at IS NOT NULL THEN greatest(0,round(extract(epoch FROM now()-break_started_at)/60))::int ELSE 0 END,
 break_started_at=NULL,status=CASE WHEN now()-clock_in_at>interval '16 hours' THEN 'auto_closed'::public.time_entry_status ELSE 'completed'::public.time_entry_status END,
 needs_review=(now()-clock_in_at>interval '16 hours'),review_reason=CASE WHEN now()-clock_in_at>interval '16 hours' THEN 'too_long' END WHERE id=e.id;
END $$;
REVOKE ALL ON FUNCTION public.clock_stop(uuid,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clock_stop(uuid,double precision,double precision) TO authenticated;
CREATE OR REPLACE FUNCTION public.review_stale_shifts() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org record; closed integer; total integer:=0;
BEGIN
 FOR org IN SELECT id FROM public.organizations WHERE active LOOP
  UPDATE public.time_entries SET clock_out_at=clock_in_at,break_minutes=0,break_started_at=NULL,status='auto_closed',needs_review=true,review_reason='missing_clock_out'
  WHERE organization_id=org.id AND clock_out_at IS NULL AND clock_in_at<now()-interval '16 hours';
  GET DIAGNOSTICS closed=ROW_COUNT; total:=total+closed;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.review_stale_shifts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_stale_shifts() TO service_role;