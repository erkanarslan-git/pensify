-- Property-specific room types, rate plans, occupancy rates and channel room mappings.
-- Tables are empty at this point; CHECK constraints make property_id mandatory.
ALTER TABLE public.room_types ADD COLUMN property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;
ALTER TABLE public.room_types ADD CONSTRAINT room_types_property_required CHECK (property_id IS NOT NULL);
ALTER TABLE public.room_types DROP CONSTRAINT room_types_organization_id_code_key;
ALTER TABLE public.room_types ADD CONSTRAINT room_types_property_code_key UNIQUE (property_id, code);
CREATE INDEX room_types_property_idx ON public.room_types(property_id);

ALTER TABLE public.rate_plans ADD COLUMN property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;
ALTER TABLE public.rate_plans ADD CONSTRAINT rate_plans_property_required CHECK (property_id IS NOT NULL);
ALTER TABLE public.occupancy_rates ADD COLUMN property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;
ALTER TABLE public.occupancy_rates ADD CONSTRAINT occupancy_rates_property_required CHECK (property_id IS NOT NULL);

ALTER TABLE public.channel_room_mappings
  ADD COLUMN property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  ADD COLUMN property_mapping_id uuid REFERENCES public.channel_property_mappings(id) ON DELETE CASCADE;
ALTER TABLE public.channel_room_mappings ADD CONSTRAINT channel_room_mappings_property_required CHECK (property_id IS NOT NULL);
ALTER TABLE public.channel_room_mappings DROP CONSTRAINT channel_room_mappings_organization_id_channel_room_type_id_key;
ALTER TABLE public.channel_room_mappings ADD CONSTRAINT channel_room_mappings_property_channel_type_key UNIQUE (property_id, channel, room_type_id);
CREATE UNIQUE INDEX channel_room_mappings_external_room_key
  ON public.channel_room_mappings(property_mapping_id, external_room_id) WHERE property_mapping_id IS NOT NULL AND external_room_id IS NOT NULL;

-- room type must belong to a property of the same organization
CREATE OR REPLACE FUNCTION public.enforce_room_type_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (SELECT organization_id FROM public.properties WHERE id = NEW.property_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'property belongs to a different organization' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_types_property_check BEFORE INSERT OR UPDATE ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_type_property();

-- rate plan inherits property from its room type
CREATE OR REPLACE FUNCTION public.enforce_same_org_rate_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t record;
BEGIN
  SELECT organization_id, property_id INTO t FROM public.room_types WHERE id = NEW.room_type_id;
  IF t.organization_id IS NULL OR t.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'room_type belongs to a different organization' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.property_id IS NOT NULL AND NEW.property_id <> t.property_id THEN
    RAISE EXCEPTION 'rate plan property differs from room type property' USING ERRCODE = 'check_violation';
  END IF;
  NEW.property_id := t.property_id;
  RETURN NEW;
END $$;

-- occupancy rate inherits property from its rate plan
CREATE OR REPLACE FUNCTION public.enforce_same_org_occupancy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record;
BEGIN
  SELECT organization_id, property_id INTO p FROM public.rate_plans WHERE id = NEW.rate_plan_id;
  IF p.organization_id IS NULL OR p.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'rate_plan belongs to a different organization' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.property_id IS NOT NULL AND NEW.property_id <> p.property_id THEN
    RAISE EXCEPTION 'occupancy property differs from rate plan property' USING ERRCODE = 'check_violation';
  END IF;
  NEW.property_id := p.property_id;
  RETURN NEW;
END $$;

-- channel room mapping: room type, rate plan and WuBook property connection must all be the same property
CREATE OR REPLACE FUNCTION public.enforce_same_org_channel_mapping()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t record; v uuid; pm record;
BEGIN
  SELECT organization_id, property_id INTO t FROM public.room_types WHERE id = NEW.room_type_id;
  IF t.organization_id IS NULL OR t.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'room_type belongs to a different organization' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.property_id IS NOT NULL AND NEW.property_id <> t.property_id THEN
    RAISE EXCEPTION 'room type belongs to a different property' USING ERRCODE = 'check_violation';
  END IF;
  NEW.property_id := t.property_id;
  IF NEW.rate_plan_id IS NOT NULL THEN
    SELECT room_type_id INTO v FROM public.rate_plans WHERE id = NEW.rate_plan_id;
    IF v IS DISTINCT FROM NEW.room_type_id THEN
      RAISE EXCEPTION 'rate plan belongs to a different room type' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.property_mapping_id IS NOT NULL THEN
    SELECT organization_id, property_id INTO pm FROM public.channel_property_mappings WHERE id = NEW.property_mapping_id;
    IF pm.organization_id IS DISTINCT FROM NEW.organization_id OR pm.property_id IS DISTINCT FROM NEW.property_id THEN
      RAISE EXCEPTION 'WuBook property connection belongs to a different property' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- rooms may only use a room type of their own property
CREATE OR REPLACE FUNCTION public.enforce_room_type_matches_room()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.room_type_id IS NOT NULL AND
     (SELECT property_id FROM public.room_types WHERE id = NEW.room_type_id) IS DISTINCT FROM NEW.property_id THEN
    RAISE EXCEPTION 'Zimmertyp gehört zu einem anderen Haus' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rooms_room_type_property_check BEFORE INSERT OR UPDATE OF room_type_id, property_id ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_type_matches_room();

REVOKE ALL ON FUNCTION public.enforce_room_type_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_room_type_matches_room() FROM PUBLIC, anon, authenticated;

-- Outbox: every event carries its property; rates vs restrictions split
CREATE OR REPLACE FUNCTION public.enqueue_channel_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb := to_jsonb(COALESCE(NEW, OLD)); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
        v_event text; v_payload jsonb; v_prop uuid := (r->>'property_id')::uuid;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    IF TG_OP = 'UPDATE' AND (r->>'room_id', r->>'check_in', r->>'check_out', r->>'status', r->>'property_id')
       IS NOT DISTINCT FROM (o->>'room_id', o->>'check_in', o->>'check_out', o->>'status', o->>'property_id') THEN
      IF (r->>'revenue', r->>'list_price', r->>'guests_count') IS NOT DISTINCT FROM (o->>'revenue', o->>'list_price', o->>'guests_count') THEN
        RETURN NULL;
      END IF;
      v_event := 'reservation_price';
      v_payload := jsonb_build_object('reservation_id', r->>'id', 'room_id', r->>'room_id',
        'revenue', (r->>'revenue')::numeric, 'previous_revenue', (o->>'revenue')::numeric,
        'list_price', (r->>'list_price')::numeric, 'guests_count', (r->>'guests_count')::int,
        'channel', r->>'channel', 'op', TG_OP);
    ELSE
      v_event := 'availability';
      v_payload := jsonb_build_object('room_ids', jsonb_build_array(r->>'room_id', o->>'room_id') - 'null',
        'from', LEAST(r->>'check_in', COALESCE(o->>'check_in', r->>'check_in')),
        'to', GREATEST(r->>'check_out', COALESCE(o->>'check_out', r->>'check_out')),
        'reservation_id', r->>'id', 'channel', r->>'channel', 'revenue', (r->>'revenue')::numeric,
        'guests_count', (r->>'guests_count')::int, 'op', TG_OP);
      -- a reservation moved to another house frees availability there too
      IF TG_OP = 'UPDATE' AND (o->>'property_id') IS DISTINCT FROM (r->>'property_id') THEN
        INSERT INTO public.integration_outbox(organization_id, property_id, event, payload)
        VALUES ((o->>'organization_id')::uuid, (o->>'property_id')::uuid, 'availability',
          v_payload || jsonb_build_object('room_ids', jsonb_build_array(o->>'room_id')));
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'rate_plans' THEN
    IF TG_OP = 'UPDATE' AND (r->>'base_price', r->>'min_stay', r->>'active') IS NOT DISTINCT FROM (o->>'base_price', o->>'min_stay', o->>'active') THEN RETURN NULL; END IF;
    v_event := CASE WHEN TG_OP = 'UPDATE' AND (r->>'base_price') IS NOT DISTINCT FROM (o->>'base_price') THEN 'restrictions' ELSE 'rates' END;
    v_payload := jsonb_build_object('rate_plan_id', r->>'id', 'room_type_id', r->>'room_type_id', 'op', TG_OP);
  ELSE -- occupancy_rates
    IF TG_OP = 'UPDATE' AND (r->>'price', r->>'min_stay', r->>'closed') IS NOT DISTINCT FROM (o->>'price', o->>'min_stay', o->>'closed') THEN RETURN NULL; END IF;
    v_event := CASE WHEN TG_OP = 'UPDATE' AND (r->>'price') IS NOT DISTINCT FROM (o->>'price') THEN 'restrictions' ELSE 'rates' END;
    v_payload := jsonb_build_object('rate_plan_id', r->>'rate_plan_id', 'date', r->>'date',
      'guest_count', (r->>'guest_count')::int, 'op', TG_OP);
  END IF;
  IF v_prop IS NULL THEN RAISE EXCEPTION 'channel event without property'; END IF;
  INSERT INTO public.integration_outbox(organization_id, property_id, event, payload)
  VALUES ((r->>'organization_id')::uuid, v_prop, v_event, v_payload);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_channel_event() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_property_required CHECK (property_id IS NOT NULL) NOT VALID;