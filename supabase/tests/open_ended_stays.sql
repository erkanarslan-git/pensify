BEGIN;
DO $$
DECLARE
  rm public.rooms%ROWTYPE;
  stay_id uuid;
  conflict_id uuid;
  actor uuid;
  created_booking uuid;
  created_id uuid;
  msg text;
BEGIN
  SELECT * INTO rm FROM public.rooms WHERE active AND status <> 'maintenance' LIMIT 1;
  IF rm.id IS NULL THEN RAISE EXCEPTION 'test room missing'; END IF;
  PERFORM set_config('app.skip_channel_outbox', 'on', true);

  INSERT INTO public.reservations(organization_id, property_id, room_id, guest_name, check_in, check_out, channel, status, revenue, long_stay)
  VALUES (rm.organization_id, rm.property_id, rm.id, 'Open-ended test', current_date + 6000, current_date + 6001, 'direct', 'confirmed', 600, true)
  RETURNING id INTO stay_id;
  IF EXISTS(SELECT 1 FROM public.reservations WHERE id = stay_id AND check_out <> DATE '9999-12-31') THEN
    RAISE EXCEPTION 'open-ended stay retained a finite checkout';
  END IF;

  BEGIN
    INSERT INTO public.reservations(organization_id, property_id, room_id, guest_name, check_in, check_out, channel, status, revenue)
    VALUES (rm.organization_id, rm.property_id, rm.id, 'Conflict test', current_date + 7000, current_date + 7002, 'direct', 'confirmed', 100)
    RETURNING id INTO conflict_id;
    RAISE EXCEPTION 'future overlap accepted';
  EXCEPTION WHEN check_violation THEN msg := SQLERRM; END;
  IF conflict_id IS NOT NULL THEN RAISE EXCEPTION 'conflicting stay stored'; END IF;

  UPDATE public.reservations SET long_stay = false, check_out = current_date + 6005 WHERE id = stay_id;
  IF EXISTS(SELECT 1 FROM public.reservations WHERE id = stay_id AND check_out = DATE '9999-12-31') THEN
    RAISE EXCEPTION 'manual stay ending did not restore a finite checkout';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'extend-long-stays') THEN RAISE EXCEPTION 'nightly extension still scheduled'; END IF;

  SELECT user_id INTO actor FROM public.organization_members WHERE organization_id = rm.organization_id AND role IN ('owner','admin') AND active ORDER BY role LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  SELECT public.create_booking_with_reservations(
    jsonb_build_object('guest_name', 'Open-ended RPC test', 'channel', 'direct', 'customer_type', 'person', 'long_stay', true),
    jsonb_build_array(jsonb_build_object('property_id', rm.property_id, 'room_id', rm.id, 'check_in', current_date + 8000, 'check_out', current_date + 8001, 'guests_count', 1, 'revenue', 600))
  ) INTO created_booking;
  SELECT r.id INTO created_id FROM public.reservations r WHERE r.booking_id = created_booking;
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id = created_id AND long_stay AND check_out = DATE '9999-12-31') THEN
    RAISE EXCEPTION 'booking RPC did not store an open-ended stay';
  END IF;
  RAISE NOTICE 'PASS open-ended stays';
END $$;
ROLLBACK;
