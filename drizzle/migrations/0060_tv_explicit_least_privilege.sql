REVOKE ALL ON public.tv_displays FROM anon, authenticated;
GRANT SELECT ON public.tv_displays TO authenticated;
GRANT ALL ON public.tv_displays TO service_role;
REVOKE ALL ON public.tv_source_settings FROM anon, authenticated;
GRANT SELECT ON public.tv_source_settings TO authenticated;
GRANT ALL ON public.tv_source_settings TO service_role;
COMMENT ON TABLE public.tv_source_settings IS 'Organization source colors shared with anonymous TV projection; raw settings require membership and writes use admin-checked RPC only.';