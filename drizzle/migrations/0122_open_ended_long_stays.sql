-- Open-ended long stays use a technical infinity date internally; the UI presents an open departure.
CREATE INDEX IF NOT EXISTS reservations_long_stay_room_idx ON public.reservations(room_id, check_in) WHERE long_stay AND deleted_at IS NULL;

-- Preserve active long-stay guests while removing the need for nightly extensions.
UPDATE public.reservations
SET check_out = DATE '9999-12-31'
WHERE long_stay AND deleted_at IS NULL AND status IN ('confirmed','tentative','checked_in');

CREATE OR REPLACE FUNCTION public.enforce_open_ended_stay()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.long_stay THEN NEW.check_out := DATE '9999-12-31'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_open_ended_stay() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a_open_ended_stay
BEFORE INSERT OR UPDATE OF long_stay, check_out ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.enforce_open_ended_stay();

CREATE OR REPLACE FUNCTION public.reservation_integrity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cap int; v_quote numeric; v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.guests_count IS DISTINCT FROM OLD.guests_count OR NEW.room_id IS DISTINCT FROM OLD.room_id THEN
    v_cap := public.room_capacity(NEW.room_id);
    IF NEW.guests_count < 1 OR (v_cap IS NOT NULL AND NEW.guests_count > v_cap) THEN
      RAISE EXCEPTION 'Zu viele Gäste für dieses Zimmer: % (maximal %)', NEW.guests_count, v_cap USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.long_stay THEN
    NEW.list_price := NULL;
  ELSIF TG_OP = 'INSERT' OR (NEW.room_id, NEW.check_in, NEW.check_out, NEW.guests_count, NEW.channel)
       IS DISTINCT FROM (OLD.room_id, OLD.check_in, OLD.check_out, OLD.guests_count, OLD.channel) THEN
    IF NEW.channel IS NOT NULL THEN
      v_quote := public.quote_room_price_for_channel(NEW.room_id, NEW.check_in, NEW.check_out, NEW.guests_count, NEW.channel);
    ELSE
      v_quote := public.quote_room_price(NEW.room_id, NEW.check_in, NEW.check_out, NEW.guests_count);
    END IF;
    IF v_quote IS NOT NULL THEN NEW.list_price := v_quote; END IF;
  END IF;
  IF NEW.revenue IS NULL OR NEW.revenue < 0 THEN NEW.revenue := 0; END IF;
  v_changed := TG_OP = 'INSERT' OR NEW.revenue IS DISTINCT FROM OLD.revenue OR NEW.list_price IS DISTINCT FROM OLD.list_price;
  IF v_changed THEN
    IF NEW.list_price IS NOT NULL AND NEW.revenue <> NEW.list_price THEN
      NEW.discount_reason := nullif(trim(coalesce(NEW.discount_reason, '')), '');
      NEW.price_overridden_by := auth.uid(); NEW.price_overridden_at := now();
    ELSE
      NEW.discount_reason := NULL; NEW.price_overridden_by := NULL; NEW.price_overridden_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.create_booking_with_reservations(_booking jsonb, _lines jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_org uuid; v_booking uuid; v_line jsonb; v_prop uuid; v_uid uuid := auth.uid();
        v_type text := coalesce(nullif(_booking->>'customer_type',''), 'person');
        v_company text := nullif(trim(coalesce(_booking->>'company_name','')),''); v_name text;
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
          _booking->>'channel', nullif(trim(_booking->>'notes'),''), v_uid, v_type, left(v_company,200),
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
      guests_count, check_in, check_out, channel, revenue, discount_reason, notes, created_by, customer_type, company_name, long_stay)
    VALUES (v_org, v_booking, v_prop, (v_line->>'room_id')::uuid, left(v_name,200),
      nullif(trim(_booking->>'guest_email'),''), nullif(trim(_booking->>'guest_phone'),''),
      coalesce((v_line->>'guests_count')::int, 1), (v_line->>'check_in')::date, (v_line->>'check_out')::date,
      (_booking->>'channel')::reservation_channel, greatest(coalesce((v_line->>'revenue')::numeric, 0), 0),
      nullif(trim(v_line->>'discount_reason'),''), nullif(trim(_booking->>'notes'),''), v_uid, v_type, left(v_company,200),
      coalesce((_booking->>'long_stay')::boolean, false));
  END LOOP;
  RETURN v_booking;
END $function$;

-- Retained only for compatibility with already-deployed callers; no extension work remains.
CREATE OR REPLACE FUNCTION public.extend_long_stays()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT 0; $$;
REVOKE ALL ON FUNCTION public.extend_long_stays() FROM public, anon, authenticated;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'extend-long-stays';
COMMENT ON FUNCTION public.extend_long_stays() IS 'DEPRECATED: open-ended long stays no longer need nightly extensions.';