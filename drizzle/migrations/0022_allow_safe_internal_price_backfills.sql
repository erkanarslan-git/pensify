CREATE OR REPLACE FUNCTION public.enqueue_channel_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb := to_jsonb(COALESCE(NEW, OLD)); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
        v_event text; v_payload jsonb; v_prop uuid := (r->>'property_id')::uuid;
BEGIN
  IF current_setting('app.skip_channel_outbox', true) = 'on' THEN
    RETURN NULL;
  END IF;

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
  ELSE
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