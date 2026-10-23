CREATE OR REPLACE FUNCTION public.prevent_reservation_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.room_id = NEW.room_id
      AND r.id <> NEW.id
      AND r.deleted_at IS NULL
      AND r.status <> 'cancelled'
      AND daterange(r.check_in, r.check_out, '[)') && daterange(NEW.check_in, NEW.check_out, '[)')
  ) THEN
    RAISE EXCEPTION 'Reservation overlap detected for room % between % and %', NEW.room_id, NEW.check_in, NEW.check_out
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$func$;