CREATE OR REPLACE FUNCTION public.set_rooms_status(_room_ids uuid[], _status public.room_status)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.default_organization_id();
  v_requested integer;
  v_allowed integer;
  v_updated integer;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'organization_required';
  END IF;
  IF NOT public.has_organization_permission(v_org, 'manage_rooms') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(DISTINCT id) INTO v_requested
  FROM unnest(coalesce(_room_ids, ARRAY[]::uuid[])) AS requested(id);

  IF v_requested = 0 OR v_requested > 200 THEN
    RAISE EXCEPTION 'invalid_room_selection';
  END IF;

  SELECT count(*) INTO v_allowed
  FROM public.rooms r
  WHERE r.id = ANY(_room_ids)
    AND r.organization_id = v_org
    AND public.can_access_property(r.property_id);

  IF v_allowed <> v_requested THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.rooms
  SET status = _status,
      updated_at = now()
  WHERE id = ANY(_room_ids)
    AND organization_id = v_org;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_rooms_status(uuid[], public.room_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_rooms_status(uuid[], public.room_status) TO authenticated;

CREATE OR REPLACE VIEW public.room_operational_status
WITH (security_invoker = true) AS
SELECT r.id AS room_id, r.organization_id, r.property_id,
  CASE
    WHEN r.status = 'maintenance' OR EXISTS (SELECT 1 FROM public.cleaning_tasks t WHERE t.room_id = r.id AND t.status = 'problem') THEN 'maintenance'
    WHEN EXISTS (SELECT 1 FROM public.cleaning_tasks t WHERE t.room_id = r.id AND t.status = 'in_progress') THEN 'cleaning_in_progress'
    WHEN EXISTS (SELECT 1 FROM public.reservations x WHERE x.room_id = r.id AND x.status <> 'cancelled' AND x.check_out = d.today) THEN 'checkout_today'
    WHEN EXISTS (SELECT 1 FROM public.reservations x WHERE x.room_id = r.id AND x.status NOT IN ('cancelled','no_show') AND x.check_in <= d.today AND x.check_out > d.today) THEN 'occupied'
    WHEN EXISTS (SELECT 1 FROM public.cleaning_tasks t WHERE t.room_id = r.id AND t.status IN ('pending','accepted') AND (t.due_at AT TIME ZONE o.timezone)::date <= d.today) THEN 'cleaning_required'
    ELSE r.status
  END::room_status AS status
FROM public.rooms r
JOIN public.organizations o ON o.id = r.organization_id
CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE coalesce(o.timezone, 'Europe/Berlin'))::date AS today) d;
GRANT SELECT ON public.room_operational_status TO authenticated;