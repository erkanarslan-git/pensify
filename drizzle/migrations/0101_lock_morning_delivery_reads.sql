REVOKE ALL ON public.morning_push_deliveries FROM anon, authenticated;
GRANT ALL ON public.morning_push_deliveries TO service_role;