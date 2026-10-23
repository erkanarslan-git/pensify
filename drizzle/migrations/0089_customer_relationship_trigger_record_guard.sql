CREATE OR REPLACE FUNCTION public.guard_customer_relationship() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=NEW.reservation_id;
 IF r.id IS NULL OR r.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'customer_organization_mismatch'; END IF;
 IF TG_TABLE_NAME='reservation_occupants' THEN
  IF NOT EXISTS(SELECT 1 FROM public.customer_parties WHERE id=NEW.person_id AND organization_id=NEW.organization_id AND kind='person') THEN RAISE EXCEPTION 'invalid_occupant'; END IF;
 END IF;
 RETURN NEW;
END $$;