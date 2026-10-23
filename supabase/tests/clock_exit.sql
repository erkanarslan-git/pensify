-- Transaction-only checkout integration test. Requires privileged test access.
BEGIN;
DO $$
DECLARE c record; p record; entry uuid; started timestamptz:=now()-interval '17 hours';
BEGIN
 SELECT cl.* INTO c FROM public.cleaners cl JOIN public.organizations o ON o.id=cl.organization_id AND o.active
 WHERE cl.time_tracking_enabled AND cl.user_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.time_entries e WHERE e.cleaner_id=cl.id AND e.clock_out_at IS NULL) LIMIT 1;
 IF c.id IS NULL THEN RAISE EXCEPTION 'No eligible test employee'; END IF;
 SELECT * INTO p FROM public.properties WHERE organization_id=c.organization_id AND active AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1;
 IF p.id IS NULL THEN RAISE EXCEPTION 'No geofenced test property'; END IF;
 INSERT INTO public.time_entries(organization_id,cleaner_id,property_id,clock_in_at,source,status)
 VALUES(c.organization_id,c.id,p.id,now()-interval '1 hour','manual','active') RETURNING id INTO entry;
 PERFORM set_config('request.jwt.claim.sub',c.user_id::text,true);
 BEGIN
  PERFORM public.clock_stop(entry,NULL,NULL);
  RAISE EXCEPTION 'Checkout without location accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'location_required' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.clock_stop(entry,CASE WHEN p.latitude>=0 THEN -80 ELSE 80 END,0);
  RAISE EXCEPTION 'Distant checkout accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'too_far' THEN RAISE; END IF; END;
 PERFORM public.clock_stop(entry,p.latitude,p.longitude);
 IF NOT EXISTS(SELECT 1 FROM public.time_entries WHERE id=entry AND clock_out_at IS NOT NULL AND status='completed') THEN RAISE EXCEPTION 'Checkout not committed'; END IF;
 PERFORM public.clock_stop(entry,p.latitude,p.longitude); -- retry must be harmless
 INSERT INTO public.time_entries(organization_id,cleaner_id,property_id,clock_in_at,source,status)
 VALUES(c.organization_id,c.id,p.id,started,'manual','active') RETURNING id INTO entry;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM public.review_stale_shifts();
 IF NOT EXISTS(SELECT 1 FROM public.time_entries WHERE id=entry AND clock_out_at=clock_in_at AND break_minutes=0 AND needs_review AND review_reason='missing_clock_out') THEN RAISE EXCEPTION 'Forgotten exit credited invented time'; END IF;
END $$;
ROLLBACK;