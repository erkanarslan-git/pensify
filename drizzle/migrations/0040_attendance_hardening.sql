-- 1. permission default for supervisors
CREATE OR REPLACE FUNCTION public.has_organization_permission(_org uuid, _permission text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role org_role; v_override boolean; v_defaults text[];
BEGIN
  v_role := public.my_org_role(_org);
  IF v_role IS NULL OR _org IS NULL THEN RETURN false; END IF;
  IF v_role = 'owner' THEN RETURN true; END IF;
  SELECT allowed INTO v_override FROM public.user_permissions
   WHERE user_id = auth.uid() AND permission = _permission AND organization_id = _org LIMIT 1;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;
  SELECT rp.allowed INTO v_override FROM public.role_permissions rp
   WHERE rp.organization_id = _org AND rp.permission = _permission
     AND public.app_to_org_role(rp.role) = v_role LIMIT 1;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;
  v_defaults := CASE _permission
    WHEN 'view_calendar' THEN ARRAY['admin','operations_manager','property_manager','reception','cleaner']
    WHEN 'create_reservation' THEN ARRAY['admin','operations_manager','property_manager','reception']
    WHEN 'create_past_reservation' THEN ARRAY['admin']
    WHEN 'delete_reservation' THEN ARRAY['admin']
    WHEN 'manage_rooms' THEN ARRAY['admin']
    WHEN 'assign_cleaning' THEN ARRAY['admin','operations_manager','property_manager']
    WHEN 'do_cleaning' THEN ARRAY['admin','operations_manager','cleaner']
    WHEN 'view_finance' THEN ARRAY['admin','operations_manager']
    WHEN 'pay_cleaners' THEN ARRAY['admin']
    WHEN 'manage_team' THEN ARRAY['admin']
    WHEN 'manage_settings' THEN ARRAY['admin']
    WHEN 'manage_integrations' THEN ARRAY['admin']
    WHEN 'manage_time' THEN ARRAY['admin','operations_manager','property_manager']
    ELSE ARRAY[]::text[] END;
  RETURN v_role::text = ANY(v_defaults);
END $function$;

-- 2. review flag
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS review_reason text;

-- 3. correction history
CREATE TABLE public.time_entry_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  old_clock_in_at timestamptz, old_clock_out_at timestamptz, old_break_minutes integer,
  new_clock_in_at timestamptz, new_clock_out_at timestamptz, new_break_minutes integer,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_entry_corrections_entry_idx ON public.time_entry_corrections(time_entry_id, changed_at DESC);
GRANT SELECT ON public.time_entry_corrections TO authenticated;
GRANT ALL ON public.time_entry_corrections TO service_role;
ALTER TABLE public.time_entry_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tec_read ON public.time_entry_corrections FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id) OR (public.has_organization_permission(organization_id,'manage_time')
    AND EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND public.can_access_property(t.property_id))));

CREATE OR REPLACE FUNCTION public.log_time_entry_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_reason text := nullif(current_setting('app.correction_reason', true), '');
BEGIN
  IF (OLD.clock_in_at IS DISTINCT FROM NEW.clock_in_at)
     OR (OLD.clock_out_at IS NOT NULL AND OLD.clock_out_at IS DISTINCT FROM NEW.clock_out_at)
     OR (OLD.clock_out_at IS NOT NULL AND OLD.break_minutes IS DISTINCT FROM NEW.break_minutes)
     OR v_reason IS NOT NULL THEN
    INSERT INTO public.time_entry_corrections(organization_id, time_entry_id, old_clock_in_at, old_clock_out_at, old_break_minutes,
      new_clock_in_at, new_clock_out_at, new_break_minutes, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, OLD.clock_in_at, OLD.clock_out_at, OLD.break_minutes,
      NEW.clock_in_at, NEW.clock_out_at, NEW.break_minutes, v_reason, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_time_entry_change ON public.time_entries;
CREATE TRIGGER trg_time_entry_change AFTER UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_time_entry_change();

-- 4. tighten policies: employees only see their open shift; writes go through RPCs
DROP POLICY IF EXISTS tenant_isolation ON public.time_entries;
DROP POLICY IF EXISTS time_entries_self_read ON public.time_entries;
DROP POLICY IF EXISTS time_entries_self_insert ON public.time_entries;
DROP POLICY IF EXISTS time_entries_self_update ON public.time_entries;
CREATE POLICY time_entries_self_open_read ON public.time_entries FOR SELECT TO authenticated
  USING (clock_out_at IS NULL AND EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = cleaner_id AND c.user_id = auth.uid()));
CREATE POLICY time_entries_supervisor_read ON public.time_entries FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id,'manage_time') AND public.can_access_property(property_id));

-- 5. supervisor correction RPC (reason required)
CREATE OR REPLACE FUNCTION public.correct_time_entry(_entry_id uuid, _clock_in_at timestamptz, _clock_out_at timestamptz, _break_minutes integer, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF coalesce(length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO e FROM public.time_entries WHERE id = _entry_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_org_admin(e.organization_id) OR (public.has_organization_permission(e.organization_id,'manage_time') AND public.can_access_property(e.property_id))) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF _clock_out_at IS NOT NULL AND _clock_out_at <= _clock_in_at THEN RAISE EXCEPTION 'invalid_range'; END IF;
  IF _clock_out_at IS NOT NULL AND _clock_out_at > now() THEN RAISE EXCEPTION 'future_time'; END IF;
  IF EXISTS (SELECT 1 FROM public.time_entries o WHERE o.cleaner_id = e.cleaner_id AND o.id <> e.id
      AND tstzrange(o.clock_in_at, coalesce(o.clock_out_at, 'infinity')) && tstzrange(_clock_in_at, coalesce(_clock_out_at,'infinity'))) THEN
    RAISE EXCEPTION 'overlap'; END IF;
  PERFORM set_config('app.correction_reason', _reason, true);
  UPDATE public.time_entries SET clock_in_at = _clock_in_at, clock_out_at = _clock_out_at,
    break_minutes = greatest(0, coalesce(_break_minutes, 0)), break_started_at = CASE WHEN _clock_out_at IS NULL THEN break_started_at END,
    status = CASE WHEN _clock_out_at IS NULL THEN status ELSE 'manually_adjusted' END,
    needs_review = false, manual_override_by = auth.uid(), manual_override_at = now(),
    notes = coalesce(notes || ' · ', '') || _reason
  WHERE id = e.id;
  PERFORM set_config('app.correction_reason', '', true);
END $$;
GRANT EXECUTE ON FUNCTION public.correct_time_entry(uuid, timestamptz, timestamptz, integer, text) TO authenticated;

-- 6. clock_start: idempotent, no overlapping sessions, forgotten clock-out goes to review with zero time
CREATE OR REPLACE FUNCTION public.clock_start(_property_id uuid, _token text, _lat double precision, _lng double precision, _accuracy double precision, _source text DEFAULT 'qr'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); p record; v_cleaner uuid; v_dist double precision; v_id uuid; v_note text; o record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _token IS NOT NULL THEN
    SELECT * INTO p FROM public.properties WHERE qr_token = _token AND active;
  ELSE
    SELECT * INTO p FROM public.properties WHERE id = _property_id AND active;
  END IF;
  IF p.id IS NULL THEN RAISE EXCEPTION 'unknown_location'; END IF;
  IF NOT public.is_organization_member(p.organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _token IS NULL AND NOT public.can_access_property(p.id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id INTO v_cleaner FROM public.cleaners WHERE user_id = v_uid AND organization_id = p.organization_id AND active LIMIT 1;
  IF v_cleaner IS NULL THEN RAISE EXCEPTION 'no_staff_profile'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('clock:' || v_cleaner::text));
  SELECT * INTO o FROM public.time_entries WHERE cleaner_id = v_cleaner AND clock_out_at IS NULL;
  IF o.id IS NOT NULL THEN
    IF o.clock_in_at < now() - interval '16 hours' THEN
      -- forgotten clock-out: close with zero duration, flag for supervisor review; no invented end time
      UPDATE public.time_entries SET clock_out_at = clock_in_at, break_started_at = NULL, break_minutes = 0,
        status = 'auto_closed', needs_review = true, review_reason = 'missing_clock_out'
       WHERE id = o.id;
    ELSIF o.property_id = p.id THEN
      RETURN o.id; -- double tap / retry
    ELSE
      RAISE EXCEPTION 'already_clocked_in';
    END IF;
  END IF;

  IF p.latitude IS NULL OR p.longitude IS NULL THEN
    IF NOT p.clock_without_location THEN RAISE EXCEPTION 'location_not_configured'; END IF;
    v_note := 'without location (manager approved)';
  ELSE
    IF _lat IS NULL OR _lng IS NULL THEN RAISE EXCEPTION 'location_required'; END IF;
    IF _accuracy IS NULL OR _accuracy > 200 THEN RAISE EXCEPTION 'location_inaccurate'; END IF;
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p.latitude - _lat) / 2), 2) +
      cos(radians(_lat)) * cos(radians(p.latitude)) * power(sin(radians(p.longitude - _lng) / 2), 2)));
    IF v_dist > coalesce(p.geofence_radius_m, 150) + _accuracy THEN RAISE EXCEPTION 'too_far'; END IF;
  END IF;

  INSERT INTO public.time_entries(organization_id, cleaner_id, property_id, clock_in_at, clock_in_lat, clock_in_lng, clock_in_accuracy_m, source, status, notes)
  VALUES (p.organization_id, v_cleaner, p.id, now(), _lat, _lng, _accuracy, CASE WHEN _source IN ('qr','manual') THEN _source ELSE 'qr' END, 'active', v_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- 7. clock_stop: retry-safe
CREATE OR REPLACE FUNCTION public.clock_stop(_entry_id uuid, _lat double precision, _lng double precision)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE e record;
BEGIN
  SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id = t.cleaner_id
   WHERE t.id = _entry_id AND c.user_id = auth.uid() FOR UPDATE OF t;
  IF e.id IS NULL THEN RAISE EXCEPTION 'no_open_shift'; END IF;
  IF e.clock_out_at IS NOT NULL THEN
    IF e.clock_out_at > now() - interval '5 minutes' THEN RETURN; END IF; -- retry of a just-finished stop
    RAISE EXCEPTION 'no_open_shift';
  END IF;
  UPDATE public.time_entries
     SET clock_out_at = now(), clock_out_lat = _lat, clock_out_lng = _lng,
         break_minutes = break_minutes + CASE WHEN break_started_at IS NOT NULL THEN greatest(0, round(extract(epoch FROM now() - break_started_at) / 60))::int ELSE 0 END,
         break_started_at = NULL,
         status = CASE WHEN now() - clock_in_at > interval '16 hours' THEN 'auto_closed'::time_entry_status ELSE 'completed'::time_entry_status END,
         needs_review = (now() - clock_in_at > interval '16 hours'),
         review_reason = CASE WHEN now() - clock_in_at > interval '16 hours' THEN 'too_long' END
   WHERE id = e.id;
END $function$;