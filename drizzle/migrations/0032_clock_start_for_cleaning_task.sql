CREATE OR REPLACE FUNCTION public.clock_start_for_task(_task_id uuid, _lat double precision, _lng double precision, _accuracy double precision)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  t record;
  p record;
  v_cleaner uuid;
  v_dist double precision;
  v_id uuid;
  v_note text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT * INTO t FROM public.cleaning_tasks WHERE id = _task_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT id INTO v_cleaner FROM public.cleaners
   WHERE user_id = v_uid AND organization_id = t.organization_id AND active LIMIT 1;
  IF v_cleaner IS NULL THEN RAISE EXCEPTION 'Konto ist keinem Reinigungsprofil zugeordnet'; END IF;

  IF t.cleaner_id IS DISTINCT FROM v_cleaner THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_organization_permission(t.organization_id, 'do_cleaning') THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Already clocked in: reuse the open shift, do not create a second entry.
  SELECT id INTO v_id FROM public.time_entries
   WHERE cleaner_id = v_cleaner AND clock_out_at IS NULL LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT * INTO p FROM public.properties WHERE id = t.property_id AND active;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Unbekannte Lokasyon'; END IF;

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

  INSERT INTO public.time_entries(organization_id, cleaner_id, property_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy_m, source, status, notes)
  VALUES (t.organization_id, v_cleaner, p.id, now(), _lat, _lng, _accuracy, 'task', 'active', v_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.clock_start_for_task(uuid, double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_start_for_task(uuid, double precision, double precision, double precision) TO authenticated;