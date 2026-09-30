CREATE OR REPLACE FUNCTION public.quote_room_price(_room_id uuid, _check_in date, _check_out date, _guests integer)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan uuid; v_base numeric; v_total numeric; v_cap int; v_prop uuid;
BEGIN
  SELECT property_id INTO v_prop FROM public.rooms WHERE id = _room_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Zimmer nicht gefunden'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.can_access_property(v_prop) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _guests IS NULL OR _guests < 1 THEN RAISE EXCEPTION 'Gästeanzahl muss mindestens 1 sein'; END IF;
  v_cap := public.room_capacity(_room_id);
  IF _guests > v_cap THEN RAISE EXCEPTION 'Zu viele Gäste: % (maximal %)', _guests, v_cap USING ERRCODE = 'check_violation'; END IF;
  SELECT rp.id, rp.base_price INTO v_plan, v_base
    FROM public.rooms r JOIN public.rate_plans rp ON rp.room_type_id = r.room_type_id AND rp.active
   WHERE r.id = _room_id ORDER BY rp.created_at LIMIT 1;
  IF v_plan IS NULL THEN RETURN NULL; END IF;
  SELECT sum(COALESCE(
           (SELECT o.price FROM public.occupancy_rates o WHERE o.rate_plan_id = v_plan AND o.date = d::date AND o.guest_count = _guests),
           (SELECT o.price FROM public.occupancy_rates o WHERE o.rate_plan_id = v_plan AND o.date = d::date AND o.guest_count IS NULL),
           v_base))
    INTO v_total FROM generate_series(_check_in, _check_out - 1, interval '1 day') d;
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.quote_room_price(uuid, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_room_price(uuid, date, date, integer) TO authenticated, service_role;