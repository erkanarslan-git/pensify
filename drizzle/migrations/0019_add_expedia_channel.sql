ALTER TYPE public.reservation_channel ADD VALUE IF NOT EXISTS 'expedia';
COMMENT ON TABLE public.channel_integrations IS 'DEPRECATED: iCal connections no longer used by the app (WuBook replaces iCal)';
COMMENT ON TABLE public.sync_jobs IS 'DEPRECATED: iCal sync jobs no longer used by the app';