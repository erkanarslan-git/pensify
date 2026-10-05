ALTER TABLE public.bookings
  ADD COLUMN customer_type text NOT NULL DEFAULT 'person' CHECK (customer_type IN ('person','company')),
  ADD COLUMN company_name text,
  ADD COLUMN company_vat_id text,
  ADD COLUMN company_address text,
  ADD COLUMN company_contact text;
ALTER TABLE public.reservations
  ADD COLUMN customer_type text NOT NULL DEFAULT 'person' CHECK (customer_type IN ('person','company')),
  ADD COLUMN company_name text;

ALTER TABLE public.rate_plans ADD COLUMN guest_prices jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.create_booking_with_reservations(_booking jsonb, _lines jsonb)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_org uuid; v_booking uuid; v_line jsonb; v_prop uuid; v_uid uuid := auth.uid();
        v_type text := coalesce(nullif(_booking->>'customer_type',''), 'person');
        v_company text := nullif(trim(coalesce(_booking->>'company_name','')),'');
        v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_type NOT IN ('person','company') THEN RAISE EXCEPTION 'invalid customer type'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'no rooms'; END IF;
  IF v_type = 'company' AND v_company IS NULL THEN RAISE EXCEPTION 'company name required'; END IF;
  IF v_type = 'person' THEN v_company := NULL; END IF;
  v_name := coalesce(nullif(trim(coalesce(_booking->>'guest_name','')),''), v_company);
  IF v_name IS NULL THEN RAISE EXCEPTION 'guest name required'; END IF;
  SELECT organization_id INTO v_org FROM public.properties WHERE id = (_lines->0->>'property_id')::uuid;
  IF v_org IS NULL OR NOT public.has_organization_permission(v_org, 'create_reservation') THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.bookings(organization_id, primary_guest_name, primary_guest_email, primary_guest_phone, channel, notes, created_by,
    customer_type, company_name, company_vat_id, company_address, company_contact)
  VALUES (v_org, left(v_name,200), nullif(trim(_booking->>'guest_email'),''), nullif(trim(_booking->>'guest_phone'),''),
          _booking->>'channel', nullif(trim(_booking->>'notes'),''), v_uid,
          v_type, left(v_company,200),
          CASE WHEN v_type='company' THEN left(nullif(trim(_booking->>'company_vat_id'),''),50) END,
          CASE WHEN v_type='company' THEN left(nullif(trim(_booking->>'company_address'),''),300) END,
          CASE WHEN v_type='company' THEN left(nullif(trim(_booking->>'company_contact'),''),200) END)
  RETURNING id INTO v_booking;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_prop := (v_line->>'property_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = (v_line->>'room_id')::uuid AND r.property_id = v_prop AND r.organization_id = v_org) THEN
      RAISE EXCEPTION 'room not in property';
    END IF;
    INSERT INTO public.reservations(organization_id, booking_id, property_id, room_id, guest_name, guest_email, guest_phone,
      guests_count, check_in, check_out, channel, revenue, discount_reason, notes, created_by, customer_type, company_name)
    VALUES (v_org, v_booking, v_prop, (v_line->>'room_id')::uuid, left(v_name,200),
      nullif(trim(_booking->>'guest_email'),''), nullif(trim(_booking->>'guest_phone'),''),
      coalesce((v_line->>'guests_count')::int, 1), (v_line->>'check_in')::date, (v_line->>'check_out')::date,
      (_booking->>'channel')::reservation_channel, greatest(coalesce((v_line->>'revenue')::numeric, 0), 0),
      nullif(trim(v_line->>'discount_reason'),''), nullif(trim(_booking->>'notes'),''), v_uid, v_type, left(v_company,200));
  END LOOP;
  RETURN v_booking;
END $function$;

CREATE OR REPLACE FUNCTION public.quote_room_price(_room_id uuid, _check_in date, _check_out date, _guests integer)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan uuid; v_base numeric; v_gp jsonb; v_std numeric; v_total numeric; v_cap int; v_prop uuid;
BEGIN
  SELECT property_id INTO v_prop FROM public.rooms WHERE id = _room_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'Zimmer nicht gefunden'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.can_access_property(v_prop) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _guests IS NULL OR _guests < 1 THEN RAISE EXCEPTION 'Gästeanzahl muss mindestens 1 sein'; END IF;
  v_cap := public.room_capacity(_room_id);
  IF _guests > v_cap THEN RAISE EXCEPTION 'Zu viele Gäste: % (maximal %)', _guests, v_cap USING ERRCODE = 'check_violation'; END IF;
  SELECT rp.id, rp.base_price, rp.guest_prices INTO v_plan, v_base, v_gp
    FROM public.rooms r JOIN public.rate_plans rp ON rp.room_type_id = r.room_type_id AND rp.active
   WHERE r.id = _room_id ORDER BY rp.created_at LIMIT 1;
  IF v_plan IS NULL THEN RETURN NULL; END IF;
  v_std := coalesce((v_gp->>(_guests::text))::numeric, v_base);
  SELECT sum(COALESCE(
           (SELECT o.price FROM public.occupancy_rates o WHERE o.rate_plan_id = v_plan AND o.date = d::date AND o.guest_count = _guests),
           (SELECT o.price FROM public.occupancy_rates o WHERE o.rate_plan_id = v_plan AND o.date = d::date AND o.guest_count IS NULL),
           v_std))
    INTO v_total FROM generate_series(_check_in, _check_out - 1, interval '1 day') d;
  RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.quote_room_price(uuid, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_room_price(uuid, date, date, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_guest_prices(_room_type_id uuid, _prices jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prop uuid; v_cap int; v_plan uuid; k text; v numeric; v_clean jsonb := '{}'::jsonb;
BEGIN
  SELECT property_id, capacity INTO v_prop, v_cap FROM public.room_types WHERE id = _room_type_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public._require_room_manager(v_prop);
  IF jsonb_typeof(_prices) <> 'object' THEN RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_plan FROM public.rate_plans WHERE room_type_id = _room_type_id AND active ORDER BY created_at LIMIT 1;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'no_rate_plan' USING ERRCODE = '22023'; END IF;
  FOR k, v IN SELECT key, (value #>> '{}')::numeric FROM jsonb_each(_prices) LOOP
    IF k !~ '^[0-9]+$' OR k::int < 1 OR k::int > v_cap THEN RAISE EXCEPTION 'invalid_capacity' USING ERRCODE = '22023'; END IF;
    IF v IS NULL OR v < 0 OR v > 100000 THEN RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023'; END IF;
    v_clean := v_clean || jsonb_build_object(k, v);
  END LOOP;
  UPDATE public.rate_plans SET guest_prices = v_clean WHERE id = v_plan;
END $$;
REVOKE ALL ON FUNCTION public.save_guest_prices(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_guest_prices(uuid, jsonb) TO authenticated;