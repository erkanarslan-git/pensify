
-- Restore SELECT on safe columns only (sensitive columns stay revoked separately)
GRANT SELECT (id, city_id, name, address, latitude, longitude, geofence_radius_m, notes, active, created_at, updated_at) ON public.properties TO authenticated;
GRANT SELECT (id, property_id, number, capacity, status, notes, floor, default_cleaner_id, created_at, updated_at) ON public.rooms TO authenticated;
GRANT SELECT (id, user_id, full_name, phone, email, active, notes, created_at, updated_at) ON public.cleaners TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cleaners TO authenticated;

GRANT ALL ON public.properties TO service_role;
GRANT ALL ON public.rooms TO service_role;
GRANT ALL ON public.cleaners TO service_role;
