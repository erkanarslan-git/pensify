ALTER TABLE public.room_issues ADD COLUMN IF NOT EXISTS resolution_note text;
CREATE OR REPLACE FUNCTION public.room_issues_after_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.rooms SET status = 'maintenance' WHERE id = NEW.room_id AND organization_id = NEW.organization_id AND status <> 'maintenance';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS room_issues_after_insert ON public.room_issues;
CREATE TRIGGER room_issues_after_insert AFTER INSERT ON public.room_issues FOR EACH ROW EXECUTE FUNCTION public.room_issues_after_insert();