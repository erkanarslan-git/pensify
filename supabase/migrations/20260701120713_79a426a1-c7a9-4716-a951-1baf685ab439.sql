
-- Restore SELECT grants stripped by earlier column-level REVOKEs.
-- Keep sensitive columns restricted.

GRANT SELECT (id, city_id, name, address, latitude, longitude, geofence_radius_m, notes, active, created_at, updated_at)
  ON public.properties TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;

GRANT SELECT (id, property_id, number, capacity, status, notes, floor, default_cleaner_id, created_at, updated_at)
  ON public.rooms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;

GRANT SELECT (id, user_id, full_name, phone, email, active, notes, created_at, updated_at)
  ON public.cleaners TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cleaners TO authenticated;
GRANT ALL ON public.cleaners TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_tasks TO authenticated;
GRANT ALL ON public.cleaning_tasks TO service_role;
