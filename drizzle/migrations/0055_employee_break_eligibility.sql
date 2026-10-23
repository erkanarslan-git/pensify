CREATE OR REPLACE FUNCTION public.clock_break_start(_entry_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record;
BEGIN
 SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id=t.cleaner_id AND c.organization_id=t.organization_id WHERE t.id=_entry_id AND c.user_id=auth.uid() AND c.time_tracking_enabled AND public.is_organization_member(t.organization_id) FOR UPDATE OF t;
 IF e.id IS NULL OR e.clock_out_at IS NOT NULL THEN RAISE EXCEPTION 'no_open_shift'; END IF;
 IF e.break_started_at IS NOT NULL THEN RETURN 'on_break'; END IF;
 UPDATE public.time_entries SET break_started_at=now(),status='on_break' WHERE id=e.id;
 INSERT INTO public.time_entry_breaks(organization_id,time_entry_id,started_at) VALUES(e.organization_id,e.id,now());
 RETURN 'on_break';
END $$;
CREATE OR REPLACE FUNCTION public.clock_break_end(_entry_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record;
BEGIN
 SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id=t.cleaner_id AND c.organization_id=t.organization_id WHERE t.id=_entry_id AND c.user_id=auth.uid() AND public.is_organization_member(t.organization_id) FOR UPDATE OF t;
 IF e.id IS NULL OR e.clock_out_at IS NOT NULL THEN RAISE EXCEPTION 'no_open_shift'; END IF;
 IF e.break_started_at IS NULL THEN RETURN 'active'; END IF;
 UPDATE public.time_entries SET break_minutes=break_minutes+greatest(0,round(extract(epoch FROM now()-break_started_at)/60))::int,break_started_at=NULL,status='active' WHERE id=e.id;
 UPDATE public.time_entry_breaks SET ended_at=now() WHERE time_entry_id=e.id AND ended_at IS NULL;
 RETURN 'active';
END $$;
REVOKE ALL ON FUNCTION public.clock_break_start(uuid),public.clock_break_end(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clock_break_start(uuid),public.clock_break_end(uuid) TO authenticated;