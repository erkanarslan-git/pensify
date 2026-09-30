-- 1. Guest-count occupancy pricing (NULL guest_count = price for any guest count)
ALTER TABLE public.occupancy_rates ADD COLUMN guest_count integer;
ALTER TABLE public.occupancy_rates ADD CONSTRAINT occupancy_rates_guest_count_check CHECK (guest_count IS NULL OR guest_count > 0);
ALTER TABLE public.occupancy_rates DROP CONSTRAINT occupancy_rates_organization_id_rate_plan_id_date_key;
CREATE UNIQUE INDEX occupancy_rates_org_plan_date_guests_key
  ON public.occupancy_rates (organization_id, rate_plan_id, date, COALESCE(guest_count, 0));

CREATE OR REPLACE FUNCTION public.room_capacity(_room_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(t.capacity, r.capacity) FROM public.rooms r
  LEFT JOIN public.room_types t ON t.id = r.room_type_id WHERE r.id = _room_id $$;
REVOKE ALL ON FUNCTION public.room_capacity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_capacity(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.quote_room_price(_room_id uuid, _check_in date, _check_out date, _guests integer)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_plan uuid; v_base numeric; v_total numeric; v_cap int;
BEGIN
  IF _check_out <= _check_in THEN RAISE EXCEPTION 'check_out must be after check_in'; END IF;
  IF _guests IS NULL OR _guests < 1 THEN RAISE EXCEPTION 'Gästeanzahl muss mindestens 1 sein'; END IF;
  v_cap := public.room_capacity(_room_id);
  IF v_cap IS NULL THEN RAISE EXCEPTION 'Zimmer nicht gefunden'; END IF;
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
-- legacy 3-arg signature kept for the currently deployed client; delegates with 1 guest
CREATE OR REPLACE FUNCTION public.quote_room_price(_room_id uuid, _check_in date, _check_out date)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT public.quote_room_price(_room_id, _check_in, _check_out, 1) $$;
COMMENT ON FUNCTION public.quote_room_price(uuid, date, date) IS 'DEPRECATED: use quote_room_price(room, in, out, guests)';

-- 5. Reservation price audit (revenue = final agreed price)
ALTER TABLE public.reservations
  ADD COLUMN list_price numeric(10,2),
  ADD COLUMN discount_amount numeric(10,2) GENERATED ALWAYS AS (list_price - revenue) STORED,
  ADD COLUMN discount_reason text,
  ADD COLUMN price_overridden_by uuid,
  ADD COLUMN price_overridden_at timestamptz;
COMMENT ON COLUMN public.reservations.revenue IS 'Final agreed price';
COMMENT ON COLUMN public.reservations.list_price IS 'Calculated list price (quote_room_price) at save time';

-- 2 + 5. Capacity and price-audit enforcement
CREATE OR REPLACE FUNCTION public.reservation_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_cap int; v_quote numeric; v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.guests_count IS DISTINCT FROM OLD.guests_count OR NEW.room_id IS DISTINCT FROM OLD.room_id THEN
    v_cap := public.room_capacity(NEW.room_id);
    IF NEW.guests_count < 1 OR (v_cap IS NOT NULL AND NEW.guests_count > v_cap) THEN
      RAISE EXCEPTION 'Zu viele Gäste für dieses Zimmer: % (maximal %)', NEW.guests_count, v_cap USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- channel imports / trusted server: price comes from the OTA

  IF TG_OP = 'INSERT' OR (NEW.room_id, NEW.check_in, NEW.check_out, NEW.guests_count)
       IS DISTINCT FROM (OLD.room_id, OLD.check_in, OLD.check_out, OLD.guests_count) THEN
    v_quote := public.quote_room_price(NEW.room_id, NEW.check_in, NEW.check_out, NEW.guests_count);
    IF v_quote IS NOT NULL THEN NEW.list_price := v_quote; END IF;
  END IF;

  v_changed := TG_OP = 'INSERT' OR NEW.revenue IS DISTINCT FROM OLD.revenue OR NEW.list_price IS DISTINCT FROM OLD.list_price;
  IF v_changed THEN
    IF NEW.list_price IS NOT NULL AND NEW.revenue <> NEW.list_price THEN
      IF length(trim(coalesce(NEW.discount_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Begründung erforderlich: Preis % € weicht vom berechneten Preis % € ab', NEW.revenue, NEW.list_price
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.price_overridden_by := auth.uid();
      NEW.price_overridden_at := now();
    ELSE
      NEW.discount_reason := NULL; NEW.price_overridden_by := NULL; NEW.price_overridden_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reservation_integrity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reservation_integrity_trg BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservation_integrity();

-- create_booking passes discount_reason (list_price is computed server-side by the trigger)
CREATE OR REPLACE FUNCTION public.create_booking_with_reservations(_booking jsonb, _lines jsonb)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $function$
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
      guests_count, check_in, check_out, channel, revenue, discount_reason, notes, created_by)
    VALUES (v_org, v_booking, v_prop, (v_line->>'room_id')::uuid, trim(_booking->>'guest_name'),
      nullif(trim(_booking->>'guest_email'),''), nullif(trim(_booking->>'guest_phone'),''),
      coalesce((v_line->>'guests_count')::int, 1), (v_line->>'check_in')::date, (v_line->>'check_out')::date,
      (_booking->>'channel')::reservation_channel, greatest(coalesce((v_line->>'revenue')::numeric, 0), 0),
      nullif(trim(v_line->>'discount_reason'),''), nullif(trim(_booking->>'notes'),''), v_uid);
  END LOOP;
  RETURN v_booking;
END $function$;

-- 4. Channel identifier: wubook (no "woobook")
UPDATE public.channel_room_mappings SET channel = 'wubook' WHERE channel = 'woobook';
ALTER TABLE public.channel_room_mappings DROP CONSTRAINT channel_room_mappings_channel_check;
ALTER TABLE public.channel_room_mappings ADD CONSTRAINT channel_room_mappings_channel_check
  CHECK (channel IN ('booking_com','airbnb','expedia','wubook','direct'));
ALTER TABLE public.channel_accounts ADD CONSTRAINT channel_accounts_provider_check CHECK (provider IN ('wubook'));
ALTER TABLE public.integration_outbox ADD CONSTRAINT integration_outbox_provider_check CHECK (provider IN ('wubook'));

-- 3. Multiple WuBook properties per organization: account (credentials) separate from property connections
CREATE TABLE public.channel_property_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.channel_accounts(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  external_property_code text NOT NULL CHECK (length(trim(external_property_code)) > 0),
  enabled boolean NOT NULL DEFAULT false,
  last_push_at timestamptz,
  last_pull_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, property_id),
  UNIQUE (account_id, external_property_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_property_mappings TO authenticated;
GRANT ALL ON public.channel_property_mappings TO service_role;
ALTER TABLE public.channel_property_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration managers read property mappings" ON public.channel_property_mappings FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_integrations'));
CREATE POLICY "integration managers write property mappings" ON public.channel_property_mappings FOR ALL TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_integrations'))
  WITH CHECK (public.has_organization_permission(organization_id, 'manage_integrations'));
CREATE INDEX channel_property_mappings_org_idx ON public.channel_property_mappings (organization_id);
CREATE TRIGGER channel_property_mappings_set_updated_at BEFORE UPDATE ON public.channel_property_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_same_org_property_mapping()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (SELECT organization_id FROM public.channel_accounts WHERE id = NEW.account_id) IS DISTINCT FROM NEW.organization_id
     OR (SELECT organization_id FROM public.properties WHERE id = NEW.property_id) IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'organization mismatch' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_same_org_property_mapping() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER channel_property_mappings_same_org BEFORE INSERT OR UPDATE ON public.channel_property_mappings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_org_property_mapping();
SELECT public.attach_audit('public.channel_property_mappings');

-- backfill any legacy single property code into a mapping only if unambiguous (org has exactly one property)
INSERT INTO public.channel_property_mappings(organization_id, account_id, property_id, external_property_code)
SELECT a.organization_id, a.id, p.id, a.property_code
  FROM public.channel_accounts a JOIN public.properties p ON p.organization_id = a.organization_id
 WHERE a.property_code IS NOT NULL
   AND (SELECT count(*) FROM public.properties p2 WHERE p2.organization_id = a.organization_id) = 1;
COMMENT ON COLUMN public.channel_accounts.property_code IS 'DEPRECATED: replaced by channel_property_mappings.external_property_code';

-- 6. Outbox: property scope + price/revenue changes
ALTER TABLE public.integration_outbox ADD COLUMN property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.enqueue_channel_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb := to_jsonb(COALESCE(NEW, OLD)); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
        v_event text; v_payload jsonb; v_prop uuid;
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    v_prop := (r->>'property_id')::uuid;
    IF TG_OP = 'UPDATE' AND (r->>'room_id', r->>'check_in', r->>'check_out', r->>'status')
       IS NOT DISTINCT FROM (o->>'room_id', o->>'check_in', o->>'check_out', o->>'status') THEN
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
    END IF;
  ELSIF TG_TABLE_NAME = 'rate_plans' THEN
    IF TG_OP = 'UPDATE' AND (r->>'base_price', r->>'min_stay', r->>'active') IS NOT DISTINCT FROM (o->>'base_price', o->>'min_stay', o->>'active') THEN RETURN NULL; END IF;
    v_event := 'rates'; v_payload := jsonb_build_object('rate_plan_id', r->>'id', 'op', TG_OP);
  ELSE
    v_event := 'rates'; v_payload := jsonb_build_object('rate_plan_id', r->>'rate_plan_id', 'date', r->>'date',
      'guest_count', (r->>'guest_count')::int, 'op', TG_OP);
  END IF;
  INSERT INTO public.integration_outbox(organization_id, property_id, event, payload)
  VALUES ((r->>'organization_id')::uuid, v_prop, v_event, v_payload);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_channel_event() FROM PUBLIC, anon, authenticated;

-- 7. Clock-in: max GPS accuracy 200 m; missing coordinates fail closed unless an audited manager override is set
ALTER TABLE public.properties
  ADD COLUMN clock_without_location boolean NOT NULL DEFAULT false,
  ADD COLUMN clock_without_location_by uuid,
  ADD COLUMN clock_without_location_at timestamptz,
  ADD COLUMN clock_without_location_reason text;

CREATE OR REPLACE FUNCTION public.audit_clock_location_override()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.clock_without_location IS DISTINCT FROM OLD.clock_without_location THEN
    IF NEW.clock_without_location THEN
      IF NOT public.has_organization_role(NEW.organization_id, ARRAY['owner','admin','operations_manager']::org_role[]) AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Nur Manager dürfen Stempeln ohne Standort erlauben' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF length(trim(coalesce(NEW.clock_without_location_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Begründung erforderlich' USING ERRCODE = 'check_violation';
      END IF;
      NEW.clock_without_location_by := auth.uid(); NEW.clock_without_location_at := now();
    ELSE
      NEW.clock_without_location_by := NULL; NEW.clock_without_location_at := NULL; NEW.clock_without_location_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_clock_location_override() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER properties_clock_override_trg BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.audit_clock_location_override();

CREATE OR REPLACE FUNCTION public.clock_start(_property_id uuid, _token text, _lat double precision, _lng double precision, _accuracy double precision, _source text DEFAULT 'qr'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); p record; v_cleaner uuid; v_dist double precision; v_id uuid; v_note text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _token IS NOT NULL THEN
    SELECT * INTO p FROM public.properties WHERE qr_token = _token AND active;
  ELSE
    SELECT * INTO p FROM public.properties WHERE id = _property_id AND active;
  END IF;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Unbekannter QR-Code / Lokasyon'; END IF;
  IF NOT public.is_organization_member(p.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _token IS NULL AND NOT public.can_access_property(p.id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO v_cleaner FROM public.cleaners WHERE user_id = v_uid AND organization_id = p.organization_id AND active LIMIT 1;
  IF v_cleaner IS NULL THEN RAISE EXCEPTION 'Konto ist keinem Reinigungsprofil zugeordnet'; END IF;

  IF p.latitude IS NULL OR p.longitude IS NULL THEN
    IF NOT p.clock_without_location THEN
      RAISE EXCEPTION 'Für dieses Haus sind keine Koordinaten hinterlegt – Stempeln nicht möglich';
    END IF;
    v_note := 'ohne Standort (Freigabe durch Manager)';
  ELSE
    IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'Standort erforderlich'; END IF;
    IF _accuracy IS NULL OR _accuracy > 200 THEN RAISE EXCEPTION 'Standort zu ungenau (±% m, erlaubt 200 m)', round(coalesce(_accuracy, 0)); END IF;
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p.latitude - _lat) / 2), 2) +
      cos(radians(_lat)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - _lng) / 2), 2)));
    IF v_dist > coalesce(p.geofence_radius_m, 150) + _accuracy THEN
      RAISE EXCEPTION 'Zu weit entfernt (~% m, erlaubt % m)', round(v_dist), p.geofence_radius_m;
    END IF;
  END IF;

  UPDATE public.time_entries
     SET clock_out_at = now(), status = 'auto_closed',
         break_minutes = break_minutes + CASE WHEN break_started_at IS NOT NULL THEN greatest(0, round(extract(epoch FROM now() - break_started_at) / 60))::int ELSE 0 END,
         break_started_at = NULL, notes = coalesce(notes || ' · ', '') || 'auto-closed by new clock-in'
   WHERE cleaner_id = v_cleaner AND clock_out_at IS NULL;

  INSERT INTO public.time_entries(organization_id, cleaner_id, property_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy_m, source, status, notes)
  VALUES (p.organization_id, v_cleaner, p.id, now(), _lat, _lng, _accuracy, CASE WHEN _source IN ('qr','manual') THEN _source ELSE 'qr' END, 'active', v_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;