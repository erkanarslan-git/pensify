GRANT SELECT (organization_id) ON public.properties TO authenticated;
GRANT SELECT (organization_id, room_type_id) ON public.rooms TO authenticated;
GRANT SELECT (organization_id) ON public.cleaners TO authenticated;