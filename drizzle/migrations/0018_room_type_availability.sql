CREATE OR REPLACE FUNCTION public.room_type_availability(_property uuid, _date date)
RETURNS TABLE(room_type_id uuid, total integer, booked integer, free integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT r.room_type_id,
         count(*)::int AS total,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.reservations x
           WHERE x.room_id = r.id AND x.status NOT IN ('cancelled','no_show')
             AND x.check_in <= _date AND x.check_out > _date))::int AS booked,
         (count(*) - count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.reservations x
           WHERE x.room_id = r.id AND x.status NOT IN ('cancelled','no_show')
             AND x.check_in <= _date AND x.check_out > _date)))::int AS free
  FROM public.rooms r
  WHERE r.property_id = _property AND r.room_type_id IS NOT NULL
  GROUP BY r.room_type_id
$$;
GRANT EXECUTE ON FUNCTION public.room_type_availability(uuid, date) TO authenticated;