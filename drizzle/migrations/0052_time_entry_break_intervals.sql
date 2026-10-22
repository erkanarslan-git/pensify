CREATE TABLE public.time_entry_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX time_entry_breaks_one_open ON public.time_entry_breaks(time_entry_id) WHERE ended_at IS NULL;
CREATE INDEX time_entry_breaks_entry ON public.time_entry_breaks(time_entry_id);
GRANT SELECT ON public.time_entry_breaks TO authenticated;
GRANT ALL ON public.time_entry_breaks TO service_role;
ALTER TABLE public.time_entry_breaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "breaks readable with entry" ON public.time_entry_breaks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id));

CREATE OR REPLACE FUNCTION public.clock_break_start(_entry_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record;
BEGIN
  SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id = t.cleaner_id
   WHERE t.id = _entry_id AND c.user_id = auth.uid() AND c.active FOR UPDATE OF t;
  IF e.id IS NULL OR e.clock_out_at IS NOT NULL THEN RAISE EXCEPTION 'no_open_shift'; END IF;
  IF e.break_started_at IS NOT NULL THEN RETURN 'on_break'; END IF; -- retry: stays on break
  UPDATE public.time_entries SET break_started_at = now(), status = 'on_break' WHERE id = e.id;
  INSERT INTO public.time_entry_breaks(organization_id, time_entry_id, started_at) VALUES (e.organization_id, e.id, now());
  RETURN 'on_break';
END $$;

CREATE OR REPLACE FUNCTION public.clock_break_end(_entry_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record;
BEGIN
  SELECT t.* INTO e FROM public.time_entries t JOIN public.cleaners c ON c.id = t.cleaner_id
   WHERE t.id = _entry_id AND c.user_id = auth.uid() AND c.active FOR UPDATE OF t;
  IF e.id IS NULL OR e.clock_out_at IS NOT NULL THEN RAISE EXCEPTION 'no_open_shift'; END IF;
  IF e.break_started_at IS NULL THEN RETURN 'active'; END IF; -- retry: stays working
  UPDATE public.time_entries
     SET break_minutes = break_minutes + greatest(0, round(extract(epoch FROM now() - break_started_at) / 60))::int,
         break_started_at = NULL, status = 'active'
   WHERE id = e.id;
  UPDATE public.time_entry_breaks SET ended_at = now() WHERE time_entry_id = e.id AND ended_at IS NULL;
  RETURN 'active';
END $$;

CREATE OR REPLACE FUNCTION public.close_open_break_on_stop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.clock_out_at IS NOT NULL AND OLD.clock_out_at IS NULL THEN
    UPDATE public.time_entry_breaks SET ended_at = greatest(started_at, NEW.clock_out_at)
     WHERE time_entry_id = NEW.id AND ended_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER time_entries_close_break AFTER UPDATE OF clock_out_at ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.close_open_break_on_stop();

REVOKE EXECUTE ON FUNCTION public.clock_break_start(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clock_break_end(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_break_start(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_break_end(uuid) TO authenticated;