-- Regression checks; uses an existing room, all changes rolled back.
BEGIN;
DO $$
DECLARE r public.rooms%ROWTYPE; before_free integer; after_free integer; before_events integer;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE active AND status <> 'maintenance' AND room_type_id IS NOT NULL LIMIT 1;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Test requires one active non-maintenance room'; END IF;
  SELECT free INTO before_free FROM public.room_type_availability(r.property_id, current_date + 5000) WHERE room_type_id = r.room_type_id;
  SELECT count(*) INTO before_events FROM public.integration_outbox WHERE property_id = r.property_id;
  UPDATE public.rooms SET status = 'maintenance' WHERE id = r.id;
  SELECT free INTO after_free FROM public.room_type_availability(r.property_id, current_date + 5000) WHERE room_type_id = r.room_type_id;
  IF after_free <> before_free - 1 THEN RAISE EXCEPTION 'Maintenance room must remove exactly one sellable room'; END IF;
  IF (SELECT count(*) FROM public.integration_outbox WHERE property_id = r.property_id AND event = 'availability') < 1
    OR (SELECT count(*) FROM public.integration_outbox WHERE property_id = r.property_id) <> before_events + 1 THEN
    RAISE EXCEPTION 'Maintenance must queue exactly one property availability event';
  END IF;
  BEGIN
    INSERT INTO public.reservations(organization_id, property_id, room_id, guest_name, check_in, check_out, channel, status, revenue)
    VALUES(r.organization_id, r.property_id, r.id, 'Maintenance regression test', current_date + 5000, current_date + 5001, 'direct', 'confirmed', 0);
    RAISE EXCEPTION 'Maintenance booking was incorrectly accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'room_not_bookable' THEN RAISE; END IF;
  END;
  UPDATE public.rooms SET status = r.status WHERE id = r.id;
  SELECT free INTO after_free FROM public.room_type_availability(r.property_id, current_date + 5000) WHERE room_type_id = r.room_type_id;
  IF after_free <> before_free THEN RAISE EXCEPTION 'Leaving maintenance must restore availability'; END IF;
  UPDATE public.rooms SET active = false WHERE id = r.id;
  SELECT free INTO after_free FROM public.room_type_availability(r.property_id, current_date + 5000) WHERE room_type_id = r.room_type_id;
  IF after_free <> before_free - 1 THEN RAISE EXCEPTION 'Inactive rooms must not be sellable'; END IF;
  BEGIN
    INSERT INTO public.reservations(organization_id, property_id, room_id, guest_name, check_in, check_out, channel, status, revenue)
    VALUES(r.organization_id, r.property_id, r.id, 'Inactive regression test', current_date + 5000, current_date + 5001, 'direct', 'confirmed', 0);
    RAISE EXCEPTION 'Inactive booking was incorrectly accepted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'room_not_bookable' THEN RAISE; END IF;
  END;
  PERFORM set_config('app.skip_channel_outbox', 'on', true);
  SELECT count(*) INTO before_events FROM public.integration_outbox WHERE property_id = r.property_id;
  UPDATE public.rooms SET active = true WHERE id = r.id;
  IF (SELECT count(*) FROM public.integration_outbox WHERE property_id = r.property_id) <> before_events THEN
    RAISE EXCEPTION 'Internal maintenance must honor outbox suppression';
  END IF;
  RAISE NOTICE 'PASS maintenance, inactive, recovery, queue and suppression';
END $$;
ROLLBACK;