CREATE OR REPLACE FUNCTION public.create_booking_with_reservations(_booking jsonb, _lines jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE v_org uuid; v_booking uuid; v_line jsonb; v_prop uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'no rooms'; END IF;
  IF length(coalesce(trim(_booking->>'guest_name'),'')) = 0 THEN RAISE EXCEPTION 'guest name required'; END IF;
  SELECT organization_id INTO v_org FROM public.properties WHERE id = (_lines->0->>'property_id')::uuid;
  IF v_org IS NULL OR NOT public.has_organization_permission(v_org, 'create_reservation') THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.bookings(organization_id, primary_guest_name, primary_guest_email, primary_guest_phone, channel, notes, created_by)
  VALUES (v_org, trim(_booking->>'guest_name'), nullif(trim(_booking->>'guest_email'),''), nullif(trim(_booking->>'guest_phone'),''),
          _booking->>'channel', nullif(trim(_booking->>'notes'),''), v_uid)
  RETURNING id INTO v_booking;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_prop := (v_line->>'property_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = (v_line->>'room_id')::uuid AND r.property_id = v_prop AND r.organization_id = v_org) THEN
      RAISE EXCEPTION 'room not in property';
    END IF;
    INSERT INTO public.reservations(organization_id, booking_id, property_id, room_id, guest_name, guest_email, guest_phone,
      guests_count, check_in, check_out, channel, revenue, notes, created_by)
    VALUES (v_org, v_booking, v_prop, (v_line->>'room_id')::uuid, trim(_booking->>'guest_name'),
      nullif(trim(_booking->>'guest_email'),''), nullif(trim(_booking->>'guest_phone'),''),
      greatest(coalesce((v_line->>'guests_count')::int, 1), 1), (v_line->>'check_in')::date, (v_line->>'check_out')::date,
      (_booking->>'channel')::reservation_channel, greatest(coalesce((v_line->>'revenue')::numeric, 0), 0),
      nullif(trim(_booking->>'notes'),''), v_uid);
  END LOOP;
  RETURN v_booking;
END $$;
REVOKE ALL ON FUNCTION public.create_booking_with_reservations(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_with_reservations(jsonb, jsonb) TO authenticated;