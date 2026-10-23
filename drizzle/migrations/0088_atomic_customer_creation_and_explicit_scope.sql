CREATE OR REPLACE FUNCTION public.can_read_customer(_org uuid,_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(_org=public.active_organization_id() AND public.has_organization_role(_org,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) AND EXISTS(SELECT 1 FROM public.customer_parties p WHERE p.id=_id AND p.organization_id=_org AND (public.is_org_admin(_org) OR p.created_by=auth.uid() OR EXISTS(SELECT 1 FROM public.reservations r WHERE r.organization_id=_org AND r.deleted_at IS NULL AND public.can_access_property(r.property_id) AND (EXISTS(SELECT 1 FROM public.reservation_customers c WHERE c.reservation_id=r.id AND c.organization_id=_org AND c.payer_id=p.id) OR EXISTS(SELECT 1 FROM public.reservation_occupants o WHERE o.reservation_id=r.id AND o.organization_id=_org AND o.person_id=p.id))))),false)
$$;
CREATE OR REPLACE FUNCTION public.create_customer_booking(_booking jsonb,_lines jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE bid uuid; rid uuid; line jsonb; org uuid:=public.active_organization_id(); payer uuid:=nullif(_booking->>'payer_id','')::uuid; people uuid[]; party public.customer_parties; prepared jsonb; seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF payer IS NULL AND _booking->'new_customer' IS NOT NULL THEN payer:=public.save_customer(_booking->'new_customer'); END IF;
 IF org IS NULL OR payer IS NULL OR NOT public.can_read_customer(org,payer) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO party FROM public.customer_parties WHERE id=payer AND organization_id=org;
 IF party.id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 prepared:=_booking || jsonb_build_object('customer_type',party.kind,'company_name',CASE WHEN party.kind='company' THEN party.name ELSE NULL END,'company_vat_id',party.vat,'company_address',party.address,'company_contact',party.contact,'guest_name',coalesce(nullif(trim(_booking->>'guest_name'),''),party.name),'guest_email',party.email,'guest_phone',party.phone);
 bid:=public.create_booking_with_reservations(prepared,_lines);
 FOR line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
 SELECT id INTO rid FROM public.reservations WHERE booking_id=bid AND organization_id=org AND room_id=(line->>'room_id')::uuid AND check_in=(line->>'check_in')::date AND NOT(id=ANY(seen)) ORDER BY created_at,id LIMIT 1;
 IF rid IS NULL THEN RAISE EXCEPTION 'reservation_link_missing'; END IF;
 seen:=array_append(seen,rid);
 IF party.kind='person' AND coalesce((line->>'payer_is_occupant')::boolean,false) THEN people:=ARRAY[payer];
 ELSE SELECT coalesce(array_agg(x::uuid),ARRAY[]::uuid[]) INTO people FROM jsonb_array_elements_text(coalesce(line->'occupants','[]'::jsonb)) x; END IF;
 PERFORM public.link_reservation_customers(ARRAY[rid],payer,people,true);
 END LOOP;
 RETURN bid;
END $$;
DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.link_reservation_customers(uuid[],uuid,uuid[],boolean)'::regprocedure) INTO d; d:=replace(d,'cardinality(_reservations) NOT BETWEEN 1 AND 100','coalesce(cardinality(_reservations),0) NOT BETWEEN 1 AND 100'); EXECUTE d; END $$;
REVOKE ALL ON FUNCTION public.guard_customer_relationship() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_customer_relationship() TO service_role;
CREATE INDEX customer_payers_party_scope ON public.reservation_customers(organization_id,payer_id,reservation_id);
CREATE INDEX customer_occupants_party_scope ON public.reservation_occupants(organization_id,person_id,reservation_id);