DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.employee_attendance_board(date,date,uuid)'::regprocedure) INTO d; d:=replace(d,'c.user_id<>auth.uid()','public.cleaner_user(e.cleaner_id)<>auth.uid()'); d:=replace(d,'public.has_department_power(org,c.user_id,''time'')','public.has_department_power(org,public.cleaner_user(e.cleaner_id),''time'')'); EXECUTE d; END $$;
CREATE FUNCTION public.guard_customer_relationship() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=NEW.reservation_id;
 IF r.id IS NULL OR r.organization_id IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'customer_organization_mismatch'; END IF;
 IF TG_TABLE_NAME='reservation_occupants' AND NOT EXISTS(SELECT 1 FROM public.customer_parties WHERE id=NEW.person_id AND organization_id=NEW.organization_id AND kind='person') THEN RAISE EXCEPTION 'invalid_occupant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_relationship_guard BEFORE INSERT OR UPDATE ON public.reservation_customers FOR EACH ROW EXECUTE FUNCTION public.guard_customer_relationship();
CREATE TRIGGER occupant_relationship_guard BEFORE INSERT OR UPDATE ON public.reservation_occupants FOR EACH ROW EXECUTE FUNCTION public.guard_customer_relationship();
CREATE OR REPLACE FUNCTION public.create_customer_booking(_booking jsonb,_lines jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE bid uuid; rid uuid; line jsonb; org uuid:=public.active_organization_id(); payer uuid:=(_booking->>'payer_id')::uuid; people uuid[]; party public.customer_parties; prepared jsonb; seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF org IS NULL OR NOT public.can_read_customer(org,payer) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO party FROM public.customer_parties WHERE id=payer AND organization_id=org;
 IF party.id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 prepared:=_booking || jsonb_build_object('customer_type',party.kind,'company_name',CASE WHEN party.kind='company' THEN party.name ELSE NULL END,'company_vat_id',party.vat,'company_address',party.address,'company_contact',party.contact,'guest_name',coalesce(nullif(trim(_booking->>'guest_name'),''),party.name),'guest_email',party.email,'guest_phone',party.phone);
 bid:=public.create_booking_with_reservations(prepared,_lines);
 FOR line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
 SELECT id INTO rid FROM public.reservations WHERE booking_id=bid AND organization_id=org AND room_id=(line->>'room_id')::uuid AND check_in=(line->>'check_in')::date AND NOT(id=ANY(seen)) ORDER BY created_at,id LIMIT 1;
 IF rid IS NULL THEN RAISE EXCEPTION 'reservation_link_missing'; END IF;
 seen:=array_append(seen,rid);
 SELECT coalesce(array_agg(x::uuid),ARRAY[]::uuid[]) INTO people FROM jsonb_array_elements_text(coalesce(line->'occupants','[]'::jsonb)) x;
 PERFORM public.link_reservation_customers(ARRAY[rid],payer,people,true);
 END LOOP;
 RETURN bid;
END $$;