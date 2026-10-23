-- Rollback-only: 7-day trash timing, restore conflicts, and finance protection with a controlled clock.
BEGIN;
DO $$
DECLARE rm public.rooms%ROWTYPE; a uuid; b uuid; res jsonb; msg text;
BEGIN
  SELECT * INTO rm FROM public.rooms WHERE active AND status <> 'maintenance' LIMIT 1;
  PERFORM set_config('app.skip_channel_outbox','on',true);
  INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,check_in,check_out,channel,status,revenue)
  VALUES(rm.organization_id,rm.property_id,rm.id,'Trash test A',current_date+5000,current_date+5002,'direct','confirmed',0) RETURNING id INTO a;
  UPDATE public.reservations SET deleted_at=now(), status_before_delete=status, status='cancelled' WHERE id=a;
  -- Deleted stay must not block availability.
  INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,check_in,check_out,channel,status,revenue)
  VALUES(rm.organization_id,rm.property_id,rm.id,'Trash test B',current_date+5001,current_date+5003,'direct','confirmed',0) RETURNING id INTO b;
  -- 167 hours later: not purged.
  PERFORM public.purge_expired_reservation_trash(now() + interval '167 hours');
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'purged before 168 hours'; END IF;
  -- Restore over an active overlapping stay must fail and leave B unchanged.
  BEGIN
    UPDATE public.reservations SET deleted_at=NULL, status='confirmed' WHERE id=a;
    RAISE EXCEPTION 'overlap restore accepted';
  EXCEPTION WHEN check_violation THEN msg := SQLERRM; END;
  IF (SELECT status FROM public.reservations WHERE id=b) <> 'confirmed' THEN RAISE EXCEPTION 'conflicting stay changed'; END IF;
  -- Restored then re-deleted record gets a fresh 168h window.
  DELETE FROM public.reservations WHERE id=b;
  UPDATE public.reservations SET deleted_at=NULL, status='confirmed' WHERE id=a;
  UPDATE public.reservations SET deleted_at=now()+interval '100 hours', status='cancelled' WHERE id=a;
  PERFORM public.purge_expired_reservation_trash(now() + interval '169 hours');
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'restored record purged with old window'; END IF;
  -- Finance history is kept even after expiry.
  INSERT INTO public.payment_schedules(organization_id,reservation_id,due_date,amount,kind) VALUES(rm.organization_id,a,current_date+5000,10,'rent');
  PERFORM public.purge_expired_reservation_trash(now() + interval '400 hours');
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'finance history destroyed'; END IF;
  DELETE FROM public.payment_schedules WHERE reservation_id=a;
  PERFORM public.purge_expired_reservation_trash(now() + interval '400 hours');
  IF EXISTS(SELECT 1 FROM public.reservations WHERE id=a) THEN RAISE EXCEPTION 'expired record not purged'; END IF;
  IF has_function_privilege('authenticated','public.purge_expired_reservation_trash(timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'cleanup callable by users'; END IF;
  IF has_function_privilege('anon','public.list_reservation_trash(text,date,date,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'anonymous trash access'; END IF;
  RAISE NOTICE 'PASS reservation trash';
END $$;
ROLLBACK;
