-- Rollback-only: 30-day trash timing, mandatory reasons, restore conflicts, and finance protection with a controlled clock.
BEGIN;
DO $$
DECLARE rm public.rooms%ROWTYPE; a uuid; b uuid; actor uuid; msg text;
BEGIN
  SELECT * INTO rm FROM public.rooms WHERE active AND status <> 'maintenance' LIMIT 1;
  PERFORM set_config('app.skip_channel_outbox','on',true);
  INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,check_in,check_out,channel,status,revenue)
  VALUES(rm.organization_id,rm.property_id,rm.id,'Trash test A',current_date+5000,current_date+5002,'direct','confirmed',0) RETURNING id INTO a;
  UPDATE public.reservations SET deleted_at=now(), status_before_delete=status, status='cancelled', cancellation_reason='Testlöschung' WHERE id=a;
  -- Deleted stay must not block availability.
  INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,check_in,check_out,channel,status,revenue)
  VALUES(rm.organization_id,rm.property_id,rm.id,'Trash test B',current_date+5001,current_date+5003,'direct','confirmed',0) RETURNING id INTO b;
  -- Cancellation without a reason is rejected even outside the UI.
  BEGIN
    UPDATE public.reservations SET status='cancelled', cancellation_reason=NULL WHERE id=b;
    RAISE EXCEPTION 'reasonless cancellation accepted';
  EXCEPTION WHEN check_violation THEN msg := SQLERRM; END;
  IF (SELECT status FROM public.reservations WHERE id=b) <> 'confirmed' THEN RAISE EXCEPTION 'reasonless cancellation changed status'; END IF;
  -- Authorized admin can cancel with a reason; actor and time are recorded.
  SELECT user_id INTO actor FROM public.organization_members WHERE organization_id=rm.organization_id AND role IN ('owner','admin') AND active ORDER BY role LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM public.cancel_reservation(b, 'Teststorno');
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=b AND status='cancelled' AND cancellation_reason='Teststorno' AND cancelled_by=actor AND cancelled_at IS NOT NULL) THEN RAISE EXCEPTION 'authorized cancellation not recorded'; END IF;
  UPDATE public.reservations SET status='confirmed', cancellation_reason=NULL, cancelled_by=NULL, cancelled_at=NULL WHERE id=b;
  BEGIN
    PERFORM public.soft_delete_reservation(b, NULL);
    RAISE EXCEPTION 'reasonless deletion accepted';
  EXCEPTION WHEN check_violation THEN msg := SQLERRM; END;
  IF (SELECT deleted_at FROM public.reservations WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'reasonless deletion changed record'; END IF;
  -- 29 days later: not purged.
  PERFORM public.purge_expired_reservation_trash(now() + interval '29 days');
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'purged before 30 days'; END IF;
  -- Restore over an active overlapping stay must fail and leave B unchanged.
  BEGIN
    UPDATE public.reservations SET deleted_at=NULL, status='confirmed' WHERE id=a;
    RAISE EXCEPTION 'overlap restore accepted';
  EXCEPTION WHEN check_violation THEN msg := SQLERRM; END;
  IF (SELECT status FROM public.reservations WHERE id=b) <> 'confirmed' THEN RAISE EXCEPTION 'conflicting stay changed'; END IF;
  -- Restored then re-deleted record gets a fresh 30-day window.
  DELETE FROM public.reservations WHERE id=b;
  UPDATE public.reservations SET deleted_at=NULL, status='confirmed' WHERE id=a;
  UPDATE public.reservations SET deleted_at=now()+interval '100 hours', status='cancelled' WHERE id=a;
  PERFORM public.purge_expired_reservation_trash(now() + interval '169 hours');
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'restored record purged with old window'; END IF;
  -- Finance history is kept even after expiry.
  INSERT INTO public.payment_schedules(organization_id,reservation_id,due_date,amount,kind) VALUES(rm.organization_id,a,current_date+5000,10,'rent');
  PERFORM public.purge_expired_reservation_trash(now() + interval '900 hours');
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'finance history destroyed'; END IF;
  DELETE FROM public.payment_schedules WHERE reservation_id=a;
  PERFORM public.purge_expired_reservation_trash(now() + interval '900 hours');
  IF EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'expired record not purged'; END IF;
  IF has_function_privilege('authenticated','public.purge_expired_reservation_trash(timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'cleanup callable by users'; END IF;
  IF has_function_privilege('anon','public.list_reservation_trash(text,date,date,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'anonymous trash access'; END IF;
  RAISE NOTICE 'PASS reservation trash';
END $$;
ROLLBACK;
