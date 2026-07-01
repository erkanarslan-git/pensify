
REVOKE ALL ON TABLE public.cleaners FROM authenticated;
REVOKE ALL ON TABLE public.cleaners FROM anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.cleaners TO authenticated;
GRANT SELECT (id, user_id, full_name, phone, email, active, notes, created_at, updated_at)
  ON TABLE public.cleaners TO authenticated;

REVOKE ALL ON TABLE public.properties FROM authenticated;
REVOKE ALL ON TABLE public.properties FROM anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.properties TO authenticated;
GRANT SELECT (id, city_id, name, address, latitude, longitude, geofence_radius_m, notes, active, created_at, updated_at)
  ON TABLE public.properties TO authenticated;

REVOKE ALL ON TABLE public.rooms FROM authenticated;
REVOKE ALL ON TABLE public.rooms FROM anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.rooms TO authenticated;
GRANT SELECT (id, property_id, number, capacity, status, notes, created_at, updated_at, floor, default_cleaner_id)
  ON TABLE public.rooms TO authenticated;

REVOKE UPDATE ON TABLE public.time_entries FROM authenticated;
GRANT UPDATE (clock_out_at, clock_out_lat, clock_out_lng, break_minutes, break_started_at, status, notes)
  ON TABLE public.time_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_property_qr(_id uuid)
RETURNS TABLE (
  id uuid, name text, address text, qr_token text,
  geofence_radius_m int, latitude double precision, longitude double precision,
  city_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
       OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.name, p.address, p.qr_token,
           p.geofence_radius_m, p.latitude, p.longitude, c.name
      FROM public.properties p
      LEFT JOIN public.cities c ON c.id = p.city_id
     WHERE p.id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_property_qr_tokens()
RETURNS TABLE (id uuid, qr_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
       OR public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT p.id, p.qr_token FROM public.properties p;
END $$;

CREATE OR REPLACE FUNCTION public.list_my_clock_properties()
RETURNS TABLE (
  id uuid, name text, qr_token text,
  latitude double precision, longitude double precision, geofence_radius_m int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  RETURN QUERY
    SELECT p.id, p.name, p.qr_token, p.latitude, p.longitude, p.geofence_radius_m
      FROM public.properties p
     ORDER BY p.name;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_clock_property(_token text)
RETURNS TABLE (
  id uuid, name text, address text,
  latitude double precision, longitude double precision, geofence_radius_m int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  RETURN QUERY
    SELECT p.id, p.name, p.address, p.latitude, p.longitude, p.geofence_radius_m
      FROM public.properties p
     WHERE p.qr_token = _token;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_cleaner_rates()
RETURNS TABLE (id uuid, hourly_rate numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
       OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT c.id, c.hourly_rate FROM public.cleaners c;
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_time_entry_paid(
  _entry_id uuid, _amount numeric, _period_start date, _period_end date
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner'::app_role)
       OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.time_entries
     SET paid_at = now(),
         paid_by = auth.uid(),
         paid_amount = _amount,
         payment_period_start = _period_start,
         payment_period_end = _period_end
   WHERE id = _entry_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_property_qr(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_property_qr_tokens() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_my_clock_properties() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_clock_property(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_cleaner_rates() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_time_entry_paid(uuid, numeric, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_property_qr(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_property_qr_tokens() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_clock_properties() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_clock_property(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_cleaner_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_time_entry_paid(uuid, numeric, date, date) TO authenticated;
