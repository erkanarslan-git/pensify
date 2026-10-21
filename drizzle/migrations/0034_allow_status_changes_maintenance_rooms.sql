CREATE OR REPLACE FUNCTION public.block_unsellable_room_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.room_status; v_active boolean;
BEGIN
  IF NEW.status IN ('cancelled','no_show') OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  -- Existing active stays may change status/details while the room is blocked; only new placements are checked.
  IF TG_OP = 'UPDATE' AND OLD.status NOT IN ('cancelled','no_show') AND OLD.deleted_at IS NULL
     AND (NEW.room_id, NEW.check_in, NEW.check_out) IS NOT DISTINCT FROM (OLD.room_id, OLD.check_in, OLD.check_out) THEN RETURN NEW; END IF;
  SELECT status, active INTO v_status, v_active FROM public.rooms WHERE id = NEW.room_id;
  IF v_status = 'maintenance' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'room_not_bookable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_unsellable_room_reservation() FROM PUBLIC, anon, authenticated;