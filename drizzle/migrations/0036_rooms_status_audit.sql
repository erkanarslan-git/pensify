ALTER TABLE public.rooms
  ADD COLUMN status_changed_by uuid,
  ADD COLUMN status_changed_at timestamptz;

COMMENT ON COLUMN public.rooms.status_changed_by IS 'User who last changed the room status (audit).';
COMMENT ON COLUMN public.rooms.status_changed_at IS 'When the room status was last changed (audit).';

CREATE OR REPLACE FUNCTION public.set_rooms_status(_room_ids uuid[], _status room_status)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.default_organization_id();
  v_requested integer; v_allowed integer; v_updated integer;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'organization_required'; END IF;
  IF NOT public.has_organization_permission(v_org, 'manage_rooms') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT count(DISTINCT id) INTO v_requested FROM unnest(coalesce(_room_ids, ARRAY[]::uuid[])) AS requested(id);
  IF v_requested = 0 OR v_requested > 200 THEN RAISE EXCEPTION 'invalid_room_selection'; END IF;
  SELECT count(*) INTO v_allowed FROM public.rooms r
  WHERE r.id = ANY(_room_ids) AND r.organization_id = v_org AND public.can_access_property(r.property_id);
  IF v_allowed <> v_requested THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.rooms SET status = _status, updated_at = now(),
    status_changed_by = auth.uid(), status_changed_at = now()
  WHERE id = ANY(_room_ids) AND organization_id = v_org;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Sending a room to cleaning must create a visible task (Cleaning, Dispatch, Dashboard read tasks).
  IF _status = 'cleaning_required' THEN
    INSERT INTO public.cleaning_tasks (organization_id, room_id, property_id, cleaner_id, due_at, status, photos_count)
    SELECT r.organization_id, r.id, r.property_id, r.default_cleaner_id, now(), 'pending', 0
    FROM public.rooms r
    WHERE r.id = ANY(_room_ids) AND r.organization_id = v_org
      AND NOT EXISTS (SELECT 1 FROM public.cleaning_tasks t WHERE t.room_id = r.id AND t.status IN ('pending','accepted','in_progress','problem'));
  END IF;
  RETURN v_updated;
END $function$;