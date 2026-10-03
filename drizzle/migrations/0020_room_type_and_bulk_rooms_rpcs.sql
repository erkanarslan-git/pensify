CREATE OR REPLACE FUNCTION public.save_room_type_with_plan(
  _property_id uuid, _room_type_id uuid, _name text, _capacity integer, _price numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_type uuid; v_code text; v_plan uuid; v_n int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT organization_id INTO v_org FROM public.properties WHERE id = _property_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_organization_member(v_org) OR NOT public.can_access_property(_property_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_organization_permission(v_org, 'manage_rooms') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  _name := btrim(coalesce(_name, ''));
  IF _name = '' OR length(_name) > 80 THEN RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023'; END IF;
  IF _capacity IS NULL OR _capacity < 1 OR _capacity > 20 THEN RAISE EXCEPTION 'invalid_capacity' USING ERRCODE = '22023'; END IF;
  IF _price IS NULL OR _price < 0 OR _price > 100000 THEN RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023'; END IF;

  IF _room_type_id IS NULL THEN
    v_code := left(coalesce(nullif(regexp_replace(regexp_replace(upper(_name), '[^A-Z0-9]+', '-', 'g'), '^-|-$', '', 'g'), ''), 'TYPE'), 20);
    WHILE EXISTS (SELECT 1 FROM public.room_types WHERE property_id = _property_id
                  AND code = CASE WHEN v_n = 0 THEN v_code ELSE v_code || '-' || v_n END) LOOP
      v_n := v_n + 1;
    END LOOP;
    IF v_n > 0 THEN v_code := v_code || '-' || v_n; END IF;
    INSERT INTO public.room_types(organization_id, property_id, name, code, capacity, base_occupancy, active)
    VALUES (v_org, _property_id, _name, v_code, _capacity, _capacity, true) RETURNING id INTO v_type;
  ELSE
    SELECT id, code INTO v_type, v_code FROM public.room_types
     WHERE id = _room_type_id AND property_id = _property_id AND organization_id = v_org FOR UPDATE;
    IF v_type IS NULL THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM public.rooms WHERE room_type_id = v_type AND capacity > _capacity) THEN
      RAISE EXCEPTION 'capacity_below_rooms' USING ERRCODE = '22023'; END IF;
    UPDATE public.room_types SET name = _name, capacity = _capacity, base_occupancy = _capacity WHERE id = v_type;
  END IF;

  SELECT id INTO v_plan FROM public.rate_plans
   WHERE room_type_id = v_type AND active ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_plan IS NULL THEN
    INSERT INTO public.rate_plans(organization_id, room_type_id, name, code, currency, base_price, min_stay, active)
    VALUES (v_org, v_type, 'Standard', v_code || '-STD', 'EUR', _price, 1, true);
  ELSE
    UPDATE public.rate_plans SET base_price = _price WHERE id = v_plan;
  END IF;
  RETURN v_type;
END $$;

CREATE OR REPLACE FUNCTION public.create_rooms_bulk(
  _property_id uuid, _room_type_id uuid, _numbers text[], _floor integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_cap int; v_num text; v_clean text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT organization_id INTO v_org FROM public.properties WHERE id = _property_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_organization_member(v_org) OR NOT public.can_access_property(_property_id)
     OR NOT public.has_organization_permission(v_org, 'manage_rooms') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT capacity INTO v_cap FROM public.room_types
   WHERE id = _room_type_id AND property_id = _property_id AND organization_id = v_org;
  IF v_cap IS NULL THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
  IF _numbers IS NULL OR cardinality(_numbers) < 1 OR cardinality(_numbers) > 50 THEN
    RAISE EXCEPTION 'invalid_count' USING ERRCODE = '22023'; END IF;
  IF _floor IS NOT NULL AND (_floor < -5 OR _floor > 100) THEN RAISE EXCEPTION 'invalid_floor' USING ERRCODE = '22023'; END IF;
  FOREACH v_num IN ARRAY _numbers LOOP
    v_num := btrim(coalesce(v_num, ''));
    IF v_num = '' OR length(v_num) > 20 THEN RAISE EXCEPTION 'invalid_number' USING ERRCODE = '22023'; END IF;
    IF v_num = ANY(v_clean) THEN RAISE EXCEPTION 'duplicate_number' USING ERRCODE = '23505'; END IF;
    v_clean := v_clean || v_num;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtext('rooms:' || _property_id::text));
  IF EXISTS (SELECT 1 FROM public.rooms WHERE property_id = _property_id AND number = ANY(v_clean)) THEN
    RAISE EXCEPTION 'number_taken' USING ERRCODE = '23505'; END IF;
  INSERT INTO public.rooms(organization_id, property_id, number, capacity, floor, status, room_type_id)
  SELECT v_org, _property_id, n, v_cap, _floor, 'available', _room_type_id FROM unnest(v_clean) AS n;
  RETURN cardinality(v_clean);
END $$;

REVOKE ALL ON FUNCTION public.save_room_type_with_plan(uuid, uuid, text, integer, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_rooms_bulk(uuid, uuid, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_room_type_with_plan(uuid, uuid, text, integer, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_rooms_bulk(uuid, uuid, text[], integer) TO authenticated, service_role;