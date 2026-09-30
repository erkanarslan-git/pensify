ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rooms_room_type_idx ON public.rooms(room_type_id);

CREATE OR REPLACE FUNCTION public.quote_room_price(_room_id uuid, _check_in date, _check_out date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE v_plan uuid; v_base numeric; v_total numeric;
BEGIN
  IF _check_out <= _check_in THEN RETURN NULL; END IF;
  SELECT rp.id, rp.base_price INTO v_plan, v_base
    FROM public.rooms r JOIN public.rate_plans rp ON rp.room_type_id = r.room_type_id AND rp.active
   WHERE r.id = _room_id ORDER BY rp.created_at LIMIT 1;
  IF v_plan IS NULL THEN RETURN NULL; END IF;
  SELECT sum(COALESCE(o.price, v_base)) INTO v_total
    FROM generate_series(_check_in, _check_out - 1, interval '1 day') d
    LEFT JOIN public.occupancy_rates o ON o.rate_plan_id = v_plan AND o.date = d::date;
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.quote_room_price(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_room_price(uuid, date, date) TO authenticated;