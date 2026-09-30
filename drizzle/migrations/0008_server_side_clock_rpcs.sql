CREATE OR REPLACE FUNCTION public.clock_start(_property_id uuid, _token text, _lat double precision, _lng double precision, _accuracy double precision, _source text DEFAULT 'qr')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); p record; v_cleaner uuid; v_dist double precision; v_id uuid;
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

  IF p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN
    IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'Standort erforderlich'; END IF;
    IF coalesce(_accuracy, 0) > 2000 THEN RAISE EXCEPTION 'Standort zu ungenau (±% m)', round(_accuracy); END IF;
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p.latitude - _lat) / 2), 2) +
      cos(radians(_lat)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - _lng) / 2), 2)));
    IF v_dist > coalesce(p.geofence_radius_m, 150) + coalesce(_accuracy, 0) THEN
      RAISE EXCEPTION 'Zu weit entfernt (~% m, erlaubt % m)', round(v_dist), p.geofence_radius_m;
    END IF;
  END IF;

  UPDATE public.time_entries
     SET clock_out_at = now(), status = 'auto_closed',
         break_minutes = break_minutes + CASE WHEN break_started_at IS NOT NULL THEN greatest(0, round(extract(epoch FROM now() - break_started_at) / 60))::int ELSE 0 END,
         break_started_at = NULL, notes = coalesce(notes || ' · ', '') || 'auto-closed by new clock-in'
   WHERE cleaner_id = v_cleaner AND clock_out_at IS NULL;

  INSERT INTO public.time_entries(organization_id, cleaner_id, property_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy_m, source, status)
  VALUES (p.organization_id, v_cleaner, p.id, now(), _lat, _lng, _accuracy, CASE WHEN _source IN ('qr','manual') THEN _source ELSE 'qr' END, 'active')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.clock_toggle_break(_entry_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e record;
BEGIN
  SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id = t.cleaner_id
   WHERE t.id = _entry_id AND c.user_id = auth.uid() AND t.clock_out_at IS NULL;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Keine offene Schicht'; END IF;
  IF e.break_started_at IS NULL THEN
    UPDATE public.time_entries SET break_started_at = now(), status = 'on_break' WHERE id = e.id;
    RETURN 'on_break';
  END IF;
  UPDATE public.time_entries
     SET break_minutes = break_minutes + greatest(0, round(extract(epoch FROM now() - break_started_at) / 60))::int,
         break_started_at = NULL, status = 'active' WHERE id = e.id;
  RETURN 'active';
END $$;

CREATE OR REPLACE FUNCTION public.clock_stop(_entry_id uuid, _lat double precision, _lng double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e record;
BEGIN
  SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id = t.cleaner_id
   WHERE t.id = _entry_id AND c.user_id = auth.uid() AND t.clock_out_at IS NULL;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Keine offene Schicht'; END IF;
  UPDATE public.time_entries
     SET clock_out_at = now(), clock_out_lat = _lat, clock_out_lng = _lng,
         break_minutes = break_minutes + CASE WHEN break_started_at IS NOT NULL THEN greatest(0, round(extract(epoch FROM now() - break_started_at) / 60))::int ELSE 0 END,
         break_started_at = NULL, status = 'completed'
   WHERE id = e.id;
END $$;

REVOKE ALL ON FUNCTION public.clock_start(uuid, text, double precision, double precision, double precision, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clock_toggle_break(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clock_stop(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_start(uuid, text, double precision, double precision, double precision, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_toggle_break(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_stop(uuid, double precision, double precision) TO authenticated;