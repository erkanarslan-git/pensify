CREATE OR REPLACE FUNCTION public.block_unsellable_room_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.room_status; v_active boolean;
BEGIN
  IF NEW.status IN ('cancelled','no_show') OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.room_id, NEW.check_in, NEW.check_out, NEW.status)
     IS NOT DISTINCT FROM (OLD.room_id, OLD.check_in, OLD.check_out, OLD.status) THEN RETURN NEW; END IF;
  SELECT status, active INTO v_status, v_active FROM public.rooms WHERE id = NEW.room_id;
  IF v_status = 'maintenance' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'room_not_bookable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_unsellable_room_reservation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reservations_room_bookable ON public.reservations;
CREATE TRIGGER reservations_room_bookable BEFORE INSERT OR UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.block_unsellable_room_reservation();

CREATE OR REPLACE FUNCTION public.room_type_availability(_property uuid, _date date)
RETURNS TABLE(room_type_id uuid, total integer, booked integer, free integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.room_type_id, count(*)::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.reservations x WHERE x.room_id = r.id
      AND x.deleted_at IS NULL AND x.status NOT IN ('cancelled','no_show') AND x.check_in <= _date AND x.check_out > _date))::int,
    count(*) FILTER (WHERE r.active AND r.status <> 'maintenance' AND NOT EXISTS (SELECT 1 FROM public.reservations x WHERE x.room_id = r.id
      AND x.deleted_at IS NULL AND x.status NOT IN ('cancelled','no_show') AND x.check_in <= _date AND x.check_out > _date))::int
  FROM public.rooms r
  WHERE r.property_id = _property AND r.room_type_id IS NOT NULL
  GROUP BY r.room_type_id
$$;
GRANT EXECUTE ON FUNCTION public.room_type_availability(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_room_sellability_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.skip_channel_outbox', true) = 'on' THEN RETURN NULL; END IF;
  IF ((OLD.status = 'maintenance') = (NEW.status = 'maintenance')) AND OLD.active IS NOT DISTINCT FROM NEW.active THEN RETURN NULL; END IF;
  INSERT INTO public.integration_outbox(organization_id, property_id, event, payload)
  VALUES (NEW.organization_id, NEW.property_id, 'availability', jsonb_build_object(
    'room_ids', jsonb_build_array(NEW.id), 'from', current_date, 'to', current_date + 365,
    'sellable', NEW.active AND NEW.status <> 'maintenance', 'reason', 'room_status', 'op', TG_OP));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_room_sellability_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS rooms_sellability_outbox ON public.rooms;
CREATE TRIGGER rooms_sellability_outbox AFTER UPDATE OF status, active ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.enqueue_room_sellability_event();