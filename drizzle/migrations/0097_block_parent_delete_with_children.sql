CREATE OR REPLACE FUNCTION public.guard_parent_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'properties' THEN
    IF EXISTS (SELECT 1 FROM public.rooms WHERE property_id = OLD.id) THEN
      RAISE EXCEPTION 'HAS_CHILDREN:property_rooms' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.room_types WHERE property_id = OLD.id) THEN
      RAISE EXCEPTION 'HAS_CHILDREN:property_room_types' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (SELECT 1 FROM public.reservations WHERE property_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.time_entries WHERE property_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.payments WHERE property_id = OLD.id) THEN
      RAISE EXCEPTION 'HAS_CHILDREN:property_history' USING ERRCODE = 'P0001'; END IF;
  ELSIF TG_TABLE_NAME = 'room_types' THEN
    IF EXISTS (SELECT 1 FROM public.rooms WHERE room_type_id = OLD.id) THEN
      RAISE EXCEPTION 'HAS_CHILDREN:room_type_rooms' USING ERRCODE = 'P0001'; END IF;
  ELSIF TG_TABLE_NAME = 'rooms' THEN
    IF EXISTS (SELECT 1 FROM public.reservations WHERE room_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.cleaning_tasks WHERE room_id = OLD.id)
       OR EXISTS (SELECT 1 FROM public.room_issues WHERE room_id = OLD.id) THEN
      RAISE EXCEPTION 'HAS_CHILDREN:room_history' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_parent_delete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_property_delete BEFORE DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.guard_parent_delete();
CREATE TRIGGER guard_room_type_delete BEFORE DELETE ON public.room_types FOR EACH ROW EXECUTE FUNCTION public.guard_parent_delete();
CREATE TRIGGER guard_room_delete BEFORE DELETE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.guard_parent_delete();