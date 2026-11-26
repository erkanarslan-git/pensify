CREATE OR REPLACE FUNCTION public.require_reservation_cancellation_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NULLIF(btrim(NEW.cancellation_reason), '') IS NULL THEN
    RAISE EXCEPTION 'cancellation_reason_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'cancelled'
     AND OLD.cancellation_reason IS NOT NULL AND NULLIF(btrim(NEW.cancellation_reason), '') IS NULL THEN
    RAISE EXCEPTION 'cancellation_reason_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancellation_reason := left(btrim(NEW.cancellation_reason), 500);
    NEW.cancelled_at := now();
    NEW.cancelled_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;