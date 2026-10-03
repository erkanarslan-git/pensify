ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS source_system text, ADD COLUMN IF NOT EXISTS external_source_id text,
  ADD COLUMN IF NOT EXISTS source_url text, ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid, ADD COLUMN IF NOT EXISTS import_needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.room_types ADD COLUMN IF NOT EXISTS source_system text, ADD COLUMN IF NOT EXISTS external_source_id text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid, ADD COLUMN IF NOT EXISTS import_needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS source_system text, ADD COLUMN IF NOT EXISTS external_source_id text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid, ADD COLUMN IF NOT EXISTS import_needs_review boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS rooms_org_source_uniq ON public.rooms(organization_id, source_system, external_source_id) WHERE external_source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS room_types_org_source_uniq ON public.room_types(organization_id, source_system, external_source_id) WHERE external_source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS properties_org_source_uniq ON public.properties(organization_id, source_system, external_source_id) WHERE external_source_id IS NOT NULL;
GRANT SELECT (active, source_system, external_source_id, source_url, source_title, import_batch_id, import_needs_review) ON public.rooms TO authenticated;
GRANT SELECT (source_system, external_source_id, import_batch_id, import_needs_review) ON public.room_types TO authenticated;
GRANT SELECT (source_system, external_source_id, import_batch_id, import_needs_review) ON public.properties TO authenticated;

-- shared guard: caller must manage rooms on this property; returns org
CREATE OR REPLACE FUNCTION public._require_room_manager(_property_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  SELECT organization_id INTO v_org FROM public.properties WHERE id = _property_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_organization_member(v_org) OR NOT public.can_access_property(_property_id)
     OR NOT public.has_organization_permission(v_org, 'manage_rooms') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION public._require_room_manager(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_room_type_full(
  _property_id uuid, _room_type_id uuid, _name text, _code text, _capacity integer,
  _base_occupancy integer, _description text, _price numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_type uuid; v_plan uuid;
BEGIN
  v_org := public._require_room_manager(_property_id);
  _name := btrim(coalesce(_name, ''));
  _code := upper(btrim(coalesce(_code, '')));
  IF _name = '' OR length(_name) > 80 THEN RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023'; END IF;
  IF _code !~ '^[A-Z0-9][A-Z0-9-]{0,19}$' THEN RAISE EXCEPTION 'invalid_code' USING ERRCODE = '22023'; END IF;
  IF _capacity IS NULL OR _capacity < 1 OR _capacity > 20 THEN RAISE EXCEPTION 'invalid_capacity' USING ERRCODE = '22023'; END IF;
  IF _base_occupancy IS NULL OR _base_occupancy < 1 OR _base_occupancy > _capacity THEN RAISE EXCEPTION 'invalid_base_occupancy' USING ERRCODE = '22023'; END IF;
  IF _price IS NULL OR _price < 0 OR _price > 100000 THEN RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023'; END IF;
  IF length(coalesce(_description, '')) > 2000 THEN RAISE EXCEPTION 'invalid_description' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.room_types WHERE property_id = _property_id AND code = _code
             AND id IS DISTINCT FROM _room_type_id) THEN
    RAISE EXCEPTION 'code_taken' USING ERRCODE = '23505'; END IF;
  IF _room_type_id IS NULL THEN
    INSERT INTO public.room_types(organization_id, property_id, name, code, capacity, base_occupancy, description, active)
    VALUES (v_org, _property_id, _name, _code, _capacity, _base_occupancy, nullif(btrim(_description), ''), true)
    RETURNING id INTO v_type;
  ELSE
    SELECT id INTO v_type FROM public.room_types
     WHERE id = _room_type_id AND property_id = _property_id AND organization_id = v_org FOR UPDATE;
    IF v_type IS NULL THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM public.rooms WHERE room_type_id = v_type AND capacity > _capacity) THEN
      RAISE EXCEPTION 'capacity_below_rooms' USING ERRCODE = '22023'; END IF;
    UPDATE public.room_types SET name = _name, code = _code, capacity = _capacity,
      base_occupancy = _base_occupancy, description = nullif(btrim(_description), '') WHERE id = v_type;
  END IF;
  SELECT id INTO v_plan FROM public.rate_plans WHERE room_type_id = v_type AND active ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_plan IS NULL THEN
    INSERT INTO public.rate_plans(organization_id, room_type_id, name, code, currency, base_price, min_stay, active)
    VALUES (v_org, v_type, 'Standard', _code || '-STD', 'EUR', _price, 1, true);
  ELSE
    UPDATE public.rate_plans SET base_price = _price WHERE id = v_plan AND base_price IS DISTINCT FROM _price;
  END IF;
  RETURN v_type;
END $$;

CREATE OR REPLACE FUNCTION public.set_room_type_active(_room_type_id uuid, _active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prop uuid;
BEGIN
  SELECT property_id INTO v_prop FROM public.room_types WHERE id = _room_type_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public._require_room_manager(v_prop);
  UPDATE public.room_types SET active = coalesce(_active, false) WHERE id = _room_type_id;
END $$;

CREATE OR REPLACE FUNCTION public.move_rooms_to_type(_from_type uuid, _to_type uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prop uuid; v_prop2 uuid; v_cap int; v_n int;
BEGIN
  SELECT property_id INTO v_prop FROM public.room_types WHERE id = _from_type;
  SELECT property_id, capacity INTO v_prop2, v_cap FROM public.room_types WHERE id = _to_type;
  IF v_prop IS NULL OR v_prop2 IS NULL OR _from_type = _to_type THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_prop <> v_prop2 THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM public._require_room_manager(v_prop);
  UPDATE public.rooms SET room_type_id = _to_type, capacity = v_cap WHERE room_type_id = _from_type;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Total price per guest count for a date range (whole room is always blocked).
CREATE OR REPLACE FUNCTION public.save_occupancy_prices(_room_type_id uuid, _from date, _to date, _prices jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prop uuid; v_org uuid; v_cap int; v_plan uuid; k text; v numeric; v_n int := 0; v_rows int;
BEGIN
  SELECT property_id, capacity INTO v_prop, v_cap FROM public.room_types WHERE id = _room_type_id;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
  v_org := public._require_room_manager(v_prop);
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 366 THEN RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(_prices) <> 'object' THEN RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_plan FROM public.rate_plans WHERE room_type_id = _room_type_id AND active ORDER BY created_at LIMIT 1;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'no_rate_plan' USING ERRCODE = '22023'; END IF;
  FOR k, v IN SELECT key, (value #>> '{}')::numeric FROM jsonb_each(_prices) LOOP
    IF k !~ '^[0-9]+$' OR k::int < 1 OR k::int > v_cap THEN RAISE EXCEPTION 'invalid_capacity' USING ERRCODE = '22023'; END IF;
    IF v IS NULL OR v < 0 OR v > 100000 THEN RAISE EXCEPTION 'invalid_price' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.occupancy_rates(organization_id, rate_plan_id, date, guest_count, price)
    SELECT v_org, v_plan, d::date, k::int, v FROM generate_series(_from, _to, interval '1 day') d
    ON CONFLICT (organization_id, rate_plan_id, date, COALESCE(guest_count, 0)) DO UPDATE SET price = EXCLUDED.price;
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_n := v_n + v_rows;
  END LOOP;
  RETURN v_n;
END $$;

-- Atomic WordPress room import. Organization resolved server-side; owner/admin only.
CREATE OR REPLACE FUNCTION public.import_wp_rooms(_batch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_batch uuid := gen_random_uuid(); p jsonb; t jsonb; r jsonb;
  v_prop uuid; v_city uuid; v_type uuid; v_cap int; v_room uuid; v_num text;
  props jsonb := '{}'::jsonb; types jsonb := '{}'::jsonb;
  c_props int := 0; c_types int := 0; c_rooms int := 0; c_upd int := 0; c_skip int := 0; c_review int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  v_org := public.active_organization_id();
  IF v_org IS NULL OR NOT public.has_organization_role(v_org, ARRAY['owner','admin']::org_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_batch->'properties') <> 'array' OR jsonb_typeof(_batch->'room_types') <> 'array'
     OR jsonb_typeof(_batch->'rooms') <> 'array' OR jsonb_array_length(_batch->'rooms') > 1000 THEN
    RAISE EXCEPTION 'invalid_batch' USING ERRCODE = '22023'; END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(_batch->'properties') LOOP
    IF coalesce(p->>'key','') = '' THEN RAISE EXCEPTION 'invalid_batch' USING ERRCODE = '22023'; END IF;
    IF nullif(p->>'existing_id','') IS NOT NULL THEN
      SELECT id INTO v_prop FROM public.properties WHERE id = (p->>'existing_id')::uuid AND organization_id = v_org;
      IF v_prop IS NULL THEN RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0002'; END IF;
    ELSE
      SELECT id INTO v_prop FROM public.properties
       WHERE organization_id = v_org AND source_system = 'wordpress' AND external_source_id = 'addr:' || (p->>'key');
      IF v_prop IS NULL THEN
        IF btrim(coalesce(p->>'name','')) = '' OR btrim(coalesce(p->>'city','')) = '' THEN RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023'; END IF;
        SELECT id INTO v_city FROM public.cities WHERE organization_id = v_org AND lower(name) = lower(btrim(p->>'city')) LIMIT 1;
        IF v_city IS NULL THEN
          INSERT INTO public.cities(organization_id, name, country) VALUES (v_org, btrim(p->>'city'), 'DE') RETURNING id INTO v_city;
        END IF;
        INSERT INTO public.properties(organization_id, city_id, name, address, source_system, external_source_id, import_batch_id, import_needs_review)
        VALUES (v_org, v_city, left(btrim(p->>'name'), 120), left(coalesce(nullif(btrim(p->>'address'),''), btrim(p->>'name')), 200),
                'wordpress', 'addr:' || (p->>'key'), v_batch, true)
        RETURNING id INTO v_prop;
        c_props := c_props + 1;
      END IF;
    END IF;
    props := props || jsonb_build_object(p->>'key', v_prop);
  END LOOP;

  FOR t IN SELECT * FROM jsonb_array_elements(_batch->'room_types') LOOP
    v_prop := (props->>(t->>'property_key'))::uuid;
    IF v_prop IS NULL THEN RAISE EXCEPTION 'invalid_batch' USING ERRCODE = '22023'; END IF;
    IF upper(coalesce(t->>'code','')) !~ '^[A-Z0-9][A-Z0-9-]{0,19}$' THEN RAISE EXCEPTION 'invalid_code' USING ERRCODE = '22023'; END IF;
    v_cap := (t->>'capacity')::int;
    IF v_cap IS NULL OR v_cap < 1 OR v_cap > 20 THEN RAISE EXCEPTION 'invalid_capacity' USING ERRCODE = '22023'; END IF;
    SELECT id INTO v_type FROM public.room_types WHERE property_id = v_prop AND code = upper(t->>'code');
    IF v_type IS NULL THEN
      INSERT INTO public.room_types(organization_id, property_id, name, code, capacity, base_occupancy, active, import_batch_id)
      VALUES (v_org, v_prop, left(btrim(t->>'name'), 80), upper(t->>'code'), v_cap, v_cap, true, v_batch)
      RETURNING id INTO v_type;
      c_types := c_types + 1;
    END IF;
    types := types || jsonb_build_object(t->>'key', v_type);
  END LOOP;

  FOR r IN SELECT * FROM jsonb_array_elements(_batch->'rooms') LOOP
    IF r->>'action' = 'skip' THEN c_skip := c_skip + 1; CONTINUE; END IF;
    v_prop := (props->>(r->>'property_key'))::uuid;
    v_type := (types->>(r->>'type_key'))::uuid;
    IF v_prop IS NULL OR v_type IS NULL OR coalesce(r->>'external_id','') !~ '^[0-9]{1,12}$' THEN
      RAISE EXCEPTION 'invalid_batch' USING ERRCODE = '22023'; END IF;
    SELECT capacity INTO v_cap FROM public.room_types WHERE id = v_type AND property_id = v_prop;
    IF v_cap IS NULL THEN RAISE EXCEPTION 'room_type_not_found' USING ERRCODE = 'P0002'; END IF;
    v_num := btrim(coalesce(r->>'number',''));
    IF v_num = '' OR length(v_num) > 20 THEN RAISE EXCEPTION 'invalid_number' USING ERRCODE = '22023'; END IF;
    IF coalesce((r->>'needs_review')::boolean, false) THEN c_review := c_review + 1; END IF;

    SELECT id INTO v_room FROM public.rooms
     WHERE organization_id = v_org AND source_system = 'wordpress' AND external_source_id = r->>'external_id';
    IF v_room IS NULL AND r->>'action' = 'link' THEN
      SELECT id INTO v_room FROM public.rooms WHERE id = (r->>'link_room_id')::uuid AND property_id = v_prop;
      IF v_room IS NULL THEN RAISE EXCEPTION 'room_not_found' USING ERRCODE = 'P0002'; END IF;
    END IF;
    IF v_room IS NOT NULL THEN
      UPDATE public.rooms SET room_type_id = v_type, capacity = v_cap, source_system = 'wordpress',
        external_source_id = r->>'external_id', source_url = left(r->>'url', 500), source_title = left(r->>'title', 200),
        import_batch_id = v_batch, import_needs_review = coalesce((r->>'needs_review')::boolean, false)
       WHERE id = v_room AND property_id = v_prop;
      c_upd := c_upd + 1;
    ELSE
      IF EXISTS (SELECT 1 FROM public.rooms WHERE property_id = v_prop AND number = v_num) THEN
        RAISE EXCEPTION 'number_taken: %', v_num USING ERRCODE = '23505'; END IF;
      INSERT INTO public.rooms(organization_id, property_id, number, capacity, floor, status, room_type_id, notes,
        source_system, external_source_id, source_url, source_title, import_batch_id, import_needs_review)
      VALUES (v_org, v_prop, v_num, v_cap, nullif(r->>'floor','')::int, 'available', v_type, NULL,
        'wordpress', r->>'external_id', left(r->>'url', 500), left(r->>'title', 200), v_batch,
        coalesce((r->>'needs_review')::boolean, false));
      c_rooms := c_rooms + 1;
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs(organization_id, actor_id, entity, entity_id, action, metadata)
  VALUES (v_org, auth.uid(), 'import', v_batch::text, 'wp_rooms_import', jsonb_build_object(
    'files', _batch->'file_names', 'properties_created', c_props, 'room_types_created', c_types,
    'rooms_created', c_rooms, 'rooms_updated', c_upd, 'rooms_skipped', c_skip, 'needs_review', c_review));

  RETURN jsonb_build_object('batch_id', v_batch, 'properties_created', c_props, 'room_types_created', c_types,
    'rooms_created', c_rooms, 'rooms_updated', c_upd, 'rooms_skipped', c_skip, 'needs_review', c_review);
END $$;

REVOKE ALL ON FUNCTION public.save_room_type_full(uuid, uuid, text, text, integer, integer, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_room_type_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_rooms_to_type(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_occupancy_prices(uuid, date, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_wp_rooms(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_room_type_full(uuid, uuid, text, text, integer, integer, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_room_type_active(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_rooms_to_type(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_occupancy_prices(uuid, date, date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_wp_rooms(jsonb) TO authenticated, service_role;