
-- 1) Rooms: per-room iCal export token
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS ical_feed_token uuid DEFAULT gen_random_uuid();
UPDATE public.rooms SET ical_feed_token = gen_random_uuid() WHERE ical_feed_token IS NULL;

-- 2) channel_integrations: allow per-room config + extra fields
ALTER TABLE public.channel_integrations
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'both' CHECK (direction IN ('import','export','both')),
  ADD COLUMN IF NOT EXISTS name text;

-- 3) sync_jobs
CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel reservation_channel NOT NULL,
  direction text NOT NULL CHECK (direction IN ('import','export')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed')),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.channel_integrations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error_message text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS sync_jobs_status_idx ON public.sync_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_jobs_channel_idx ON public.sync_jobs(channel, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_jobs TO authenticated;
GRANT ALL ON public.sync_jobs TO service_role;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners and managers read sync_jobs" ON public.sync_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "owners and managers write sync_jobs" ON public.sync_jobs FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 4) conflict_alerts
CREATE TABLE IF NOT EXISTS public.conflict_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  existing_reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  incoming_channel reservation_channel NOT NULL,
  incoming_payload jsonb NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conflict_alerts_status_idx ON public.conflict_alerts(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conflict_alerts TO authenticated;
GRANT ALL ON public.conflict_alerts TO service_role;
ALTER TABLE public.conflict_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners and managers manage conflicts" ON public.conflict_alerts FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- 5) Overlap-prevention trigger on reservations
CREATE OR REPLACE FUNCTION public.prevent_reservation_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.room_id = NEW.room_id
      AND r.id <> NEW.id
      AND r.status <> 'cancelled'
      AND daterange(r.check_in, r.check_out, '[)') && daterange(NEW.check_in, NEW.check_out, '[)')
  ) THEN
    RAISE EXCEPTION 'Reservation overlap detected for room % between % and %', NEW.room_id, NEW.check_in, NEW.check_out
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_reservation_overlap_trg ON public.reservations;
CREATE TRIGGER prevent_reservation_overlap_trg
  BEFORE INSERT OR UPDATE OF check_in, check_out, room_id, status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_reservation_overlap();

-- 6) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conflict_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
