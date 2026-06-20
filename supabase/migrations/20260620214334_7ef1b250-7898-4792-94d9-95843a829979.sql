
-- 1) Add default cleaner to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS default_cleaner_id uuid NULL
  REFERENCES public.cleaners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rooms_default_cleaner_id_idx
  ON public.rooms(default_cleaner_id);

-- 2) Auto-create a cleaning task when a reservation is created/updated
CREATE OR REPLACE FUNCTION public.auto_create_cleaning_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_cleaner uuid;
  v_due timestamptz;
BEGIN
  -- Only for active reservations
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Skip if a task already exists for this room on the checkout day
  IF EXISTS (
    SELECT 1 FROM public.cleaning_tasks ct
    WHERE ct.room_id = NEW.room_id
      AND ct.due_at::date = NEW.check_out
  ) THEN
    RETURN NEW;
  END IF;

  SELECT default_cleaner_id INTO v_default_cleaner
  FROM public.rooms WHERE id = NEW.room_id;

  -- Due at 11:00 local-ish (UTC ok for now) on the checkout day
  v_due := (NEW.check_out::timestamp + interval '11 hours') AT TIME ZONE 'UTC';

  INSERT INTO public.cleaning_tasks
    (room_id, property_id, cleaner_id, due_at, status, photos_count)
  VALUES
    (NEW.room_id, NEW.property_id, v_default_cleaner, v_due, 'pending', 0);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reservations_auto_cleaning ON public.reservations;
CREATE TRIGGER trg_reservations_auto_cleaning
AFTER INSERT OR UPDATE OF check_out, room_id, status ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.auto_create_cleaning_task();
