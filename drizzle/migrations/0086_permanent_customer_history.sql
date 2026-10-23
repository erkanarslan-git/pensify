CREATE TABLE public.customer_parties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),kind text NOT NULL CHECK(kind IN('person','company')),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 250),email text,phone text,vat text,address text,contact text,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,id));
GRANT SELECT ON public.customer_parties TO authenticated;
GRANT ALL ON public.customer_parties TO service_role;
ALTER TABLE public.customer_parties ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.reservation_customers(organization_id uuid NOT NULL REFERENCES public.organizations(id),reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id),payer_id uuid NOT NULL,linked_by uuid,linked_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(organization_id,payer_id) REFERENCES public.customer_parties(organization_id,id));
GRANT SELECT ON public.reservation_customers TO authenticated;
GRANT ALL ON public.reservation_customers TO service_role;
ALTER TABLE public.reservation_customers ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.reservation_occupants(organization_id uuid NOT NULL REFERENCES public.organizations(id),reservation_id uuid NOT NULL REFERENCES public.reservations(id),person_id uuid NOT NULL,PRIMARY KEY(reservation_id,person_id),FOREIGN KEY(organization_id,person_id) REFERENCES public.customer_parties(organization_id,id));
GRANT SELECT ON public.reservation_occupants TO authenticated;
GRANT ALL ON public.reservation_occupants TO service_role;
ALTER TABLE public.reservation_occupants ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.can_read_customer(_org uuid,_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _org=public.active_organization_id() AND public.has_organization_role(_org,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) AND (public.is_org_admin(_org) OR EXISTS(SELECT 1 FROM public.reservations r WHERE r.organization_id=_org AND r.deleted_at IS NULL AND public.can_access_property(r.property_id) AND (EXISTS(SELECT 1 FROM public.reservation_customers c WHERE c.reservation_id=r.id AND c.organization_id=_org AND c.payer_id=_id) OR EXISTS(SELECT 1 FROM public.reservation_occupants o WHERE o.reservation_id=r.id AND o.organization_id=_org AND o.person_id=_id))) OR EXISTS(SELECT 1 FROM public.customer_parties p WHERE p.id=_id AND p.organization_id=_org AND p.created_by=auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.can_read_customer(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_customer(uuid,uuid) TO authenticated,service_role;
CREATE POLICY customer_read ON public.customer_parties FOR SELECT TO authenticated USING(public.can_read_customer(organization_id,id));
CREATE POLICY customer_links_read ON public.reservation_customers FOR SELECT TO authenticated USING(organization_id=public.active_organization_id() AND EXISTS(SELECT 1 FROM public.reservations r WHERE r.id=reservation_id AND r.organization_id=reservation_customers.organization_id AND public.can_access_property(r.property_id)));
CREATE POLICY occupant_links_read ON public.reservation_occupants FOR SELECT TO authenticated USING(organization_id=public.active_organization_id() AND EXISTS(SELECT 1 FROM public.reservations r WHERE r.id=reservation_id AND r.organization_id=reservation_occupants.organization_id AND public.can_access_property(r.property_id)));
SELECT public.attach_audit('public.customer_parties');
SELECT public.attach_audit('public.reservation_customers');
SELECT public.attach_audit('public.reservation_occupants');
CREATE FUNCTION public.save_customer(_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); result uuid;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.has_organization_permission(org,'create_reservation') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _data->>'kind' NOT IN('person','company') OR length(trim(coalesce(_data->>'name',''))) NOT BETWEEN 1 AND 250 OR length(coalesce(_data->>'email',''))>254 OR length(coalesce(_data->>'phone',''))>80 OR length(coalesce(_data->>'vat',''))>80 OR length(coalesce(_data->>'address',''))>2000 OR length(coalesce(_data->>'contact',''))>250 THEN RAISE EXCEPTION 'invalid_customer'; END IF;
 IF _id IS NULL THEN
 INSERT INTO public.customer_parties(organization_id,kind,name,email,phone,vat,address,contact,created_by) VALUES(org,_data->>'kind',trim(_data->>'name'),nullif(trim(_data->>'email'),''),nullif(trim(_data->>'phone'),''),nullif(trim(_data->>'vat'),''),nullif(trim(_data->>'address'),''),nullif(trim(_data->>'contact'),''),auth.uid()) RETURNING id INTO result;
 ELSE
 IF NOT public.can_read_customer(org,_id) OR EXISTS(SELECT 1 FROM public.reservations r JOIN public.reservation_customers c ON c.reservation_id=r.id WHERE c.payer_id=_id AND r.organization_id=org AND NOT public.can_access_property(r.property_id)) OR EXISTS(SELECT 1 FROM public.reservations r JOIN public.reservation_occupants o ON o.reservation_id=r.id WHERE o.person_id=_id AND r.organization_id=org AND NOT public.can_access_property(r.property_id)) THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.customer_parties SET name=trim(_data->>'name'),email=nullif(trim(_data->>'email'),''),phone=nullif(trim(_data->>'phone'),''),vat=nullif(trim(_data->>'vat'),''),address=nullif(trim(_data->>'address'),''),contact=nullif(trim(_data->>'contact'),''),updated_at=now() WHERE id=_id AND organization_id=org AND kind=_data->>'kind' RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.link_reservation_customers(_reservations uuid[],_payer uuid,_people uuid[],_confirm boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); rid uuid; pid uuid; r record;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT coalesce(_confirm,false) OR NOT public.has_organization_permission(org,'create_reservation') OR cardinality(_reservations) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT public.can_read_customer(org,_payer) THEN RAISE EXCEPTION 'forbidden'; END IF;
 FOREACH pid IN ARRAY coalesce(_people,ARRAY[]::uuid[]) LOOP
 IF NOT public.can_read_customer(org,pid) OR NOT EXISTS(SELECT 1 FROM public.customer_parties WHERE id=pid AND organization_id=org AND kind='person') THEN RAISE EXCEPTION 'invalid_occupant'; END IF;
 END LOOP;
 FOREACH rid IN ARRAY _reservations LOOP
 SELECT * INTO r FROM public.reservations WHERE id=rid AND organization_id=org FOR UPDATE;
 IF r.id IS NULL OR r.deleted_at IS NOT NULL OR NOT public.can_access_property(r.property_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF cardinality(coalesce(_people,ARRAY[]::uuid[]))>r.guests_count THEN RAISE EXCEPTION 'too_many_occupants'; END IF;
 INSERT INTO public.reservation_customers(organization_id,reservation_id,payer_id,linked_by) VALUES(org,rid,_payer,auth.uid()) ON CONFLICT(reservation_id) DO UPDATE SET payer_id=excluded.payer_id,linked_by=auth.uid(),linked_at=now();
 DELETE FROM public.reservation_occupants WHERE reservation_id=rid AND organization_id=org;
 INSERT INTO public.reservation_occupants(organization_id,reservation_id,person_id) SELECT org,rid,x FROM unnest(coalesce(_people,ARRAY[]::uuid[])) x GROUP BY x;
 END LOOP;
END $$;
CREATE FUNCTION public.customer_history(_kind text DEFAULT 'person',_search text DEFAULT '',_property uuid DEFAULT NULL,_from date DEFAULT NULL,_to date DEFAULT NULL,_active boolean DEFAULT false,_page integer DEFAULT 0,_size integer DEFAULT 20,_party uuid DEFAULT NULL,_status text DEFAULT NULL,_person uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.has_organization_role(org,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _kind NOT IN('person','company') OR _page<0 OR _size NOT IN(10,20,30,40,50) OR length(_search)>120 OR (_from IS NOT NULL AND _to IS NOT NULL AND _to<_from) THEN RAISE EXCEPTION 'invalid_filter'; END IF;
 WITH stays AS (
 SELECT r.*,p.name AS property_name,rm.number AS room_number,c.payer_id,pa.kind AS payer_kind,pa.name AS payer_name
 FROM public.reservations r JOIN public.properties p ON p.id=r.property_id AND p.organization_id=org JOIN public.rooms rm ON rm.id=r.room_id AND rm.organization_id=org LEFT JOIN public.reservation_customers c ON c.reservation_id=r.id AND c.organization_id=org LEFT JOIN public.customer_parties pa ON pa.id=c.payer_id AND pa.organization_id=org
 WHERE r.organization_id=org AND r.deleted_at IS NULL AND public.can_access_property(r.property_id) AND (_property IS NULL OR r.property_id=_property) AND (_from IS NULL OR r.check_out>_from) AND (_to IS NULL OR r.check_in<=_to) AND (NOT _active OR (r.status='checked_in' AND r.check_in<=(now() AT TIME ZONE 'Europe/Berlin')::date AND r.check_out>(now() AT TIME ZONE 'Europe/Berlin')::date)) AND (_status IS NULL OR r.status::text=_status) AND (_person IS NULL OR EXISTS(SELECT 1 FROM public.reservation_occupants o WHERE o.reservation_id=r.id AND o.organization_id=org AND o.person_id=_person))
 ), relationships AS (
 SELECT s.id,s.payer_id AS party_id FROM stays s WHERE s.payer_id IS NOT NULL
 UNION SELECT s.id,o.person_id FROM stays s JOIN public.reservation_occupants o ON o.reservation_id=s.id AND o.organization_id=org
 ), records AS (
 SELECT p.id AS party_id,'party:'||p.id::text AS identity_key,p.kind AS customer_type,p.name,CASE WHEN p.kind='company' THEN p.name END AS company,p.email,p.phone,p.vat,p.address,p.contact,false AS unresolved,
 coalesce((SELECT jsonb_agg(s.id ORDER BY s.check_in DESC,s.id) FROM stays s JOIN relationships x ON x.id=s.id WHERE x.party_id=p.id),'[]'::jsonb) AS reservation_ids
 FROM public.customer_parties p WHERE p.organization_id=org AND p.kind=_kind AND public.can_read_customer(org,p.id) AND (_party IS NULL OR p.id=_party) AND (EXISTS(SELECT 1 FROM relationships x WHERE x.party_id=p.id) OR (_property IS NULL AND _from IS NULL AND _to IS NULL AND NOT _active AND _status IS NULL AND _person IS NULL))
 UNION ALL
 SELECT NULL::uuid,CASE WHEN s.booking_id IS NOT NULL THEN 'booking:'||s.booking_id::text ELSE 'reservation:'||s.id::text END,_kind,min(CASE WHEN _kind='company' THEN coalesce(s.company_name,s.guest_name) ELSE s.guest_name END),min(s.company_name),min(s.guest_email),min(s.guest_phone),min(b.company_vat_id),min(b.company_address),min(b.company_contact),true,jsonb_agg(s.id ORDER BY s.check_in DESC,s.id)
 FROM stays s LEFT JOIN public.bookings b ON b.id=s.booking_id AND b.organization_id=org WHERE s.payer_id IS NULL AND _party IS NULL AND ((_kind='company' AND s.customer_type='company') OR (_kind='person' AND s.customer_type<>'company')) GROUP BY CASE WHEN s.booking_id IS NOT NULL THEN 'booking:'||s.booking_id::text ELSE 'reservation:'||s.id::text END
 ), filtered AS (SELECT * FROM records WHERE _search='' OR position(lower(_search) IN lower(concat_ws(' ',name,company,email,phone,vat,party_id::text)))>0), paged AS (SELECT * FROM filtered ORDER BY name,identity_key LIMIT _size OFFSET _page*_size), projected AS (
 SELECT paged.*,jsonb_array_length(reservation_ids) AS stays,(SELECT max(s.check_out) FROM stays s WHERE reservation_ids ? s.id::text) AS last_stay,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'booking_id',s.booking_id,'check_in',s.check_in,'check_out',s.check_out,'status',s.status,'property_id',s.property_id,'property',s.property_name,'room',s.room_number,'guests_count',s.guests_count,'payer_id',s.payer_id,'payer_name',s.payer_name,'payer_kind',s.payer_kind,'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) FROM public.reservation_occupants o JOIN public.customer_parties p ON p.id=o.person_id AND p.organization_id=org WHERE o.reservation_id=s.id AND o.organization_id=org),'[]'::jsonb)) || CASE WHEN public.can_finance_action(org,s.property_id,'view_finance') AND (paged.unresolved OR s.payer_id=paged.party_id) THEN jsonb_build_object('finance',jsonb_build_object('revenue',s.revenue,'paid',coalesce((SELECT sum(amount) FROM public.payments WHERE reservation_id=s.id AND organization_id=org AND reversed_at IS NULL AND kind='rent'),0),'advance',coalesce((SELECT sum(amount) FROM public.payments WHERE reservation_id=s.id AND organization_id=org AND reversed_at IS NULL AND kind='unallocated'),0),'deposit',coalesce((SELECT sum(amount) FROM public.payments WHERE reservation_id=s.id AND organization_id=org AND reversed_at IS NULL AND kind='deposit'),0),'schedules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ps.id,'due_date',ps.due_date,'kind',ps.kind,'amount',ps.amount,'paid',coalesce((SELECT sum(pm.amount) FROM public.payments pm WHERE pm.schedule_id=ps.id AND pm.organization_id=org AND pm.reversed_at IS NULL),0)) ORDER BY ps.due_date,ps.id) FROM public.payment_schedules ps WHERE ps.reservation_id=s.id AND ps.organization_id=org),'[]'::jsonb))) ELSE '{}'::jsonb END ORDER BY s.check_in DESC,s.id) FROM stays s WHERE reservation_ids ? s.id::text),'[]'::jsonb) AS reservations FROM paged
 ) SELECT jsonb_build_object('org',org,'total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(projected)-'reservation_ids') FROM projected),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_customer(jsonb,uuid),public.link_reservation_customers(uuid[],uuid,uuid[],boolean),public.customer_history(text,text,uuid,date,date,boolean,integer,integer,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_customer(jsonb,uuid),public.link_reservation_customers(uuid[],uuid,uuid[],boolean),public.customer_history(text,text,uuid,date,date,boolean,integer,integer,uuid,text,uuid) TO authenticated,service_role;
CREATE FUNCTION public.create_customer_booking(_booking jsonb,_lines jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE bid uuid; rid uuid; line jsonb; org uuid:=public.active_organization_id(); payer uuid:=(_booking->>'payer_id')::uuid; people uuid[];
BEGIN
 IF org IS NULL OR NOT public.can_read_customer(org,payer) THEN RAISE EXCEPTION 'forbidden'; END IF;
 bid:=public.create_booking_with_reservations(_booking,_lines);
 FOR line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
 SELECT id INTO rid FROM public.reservations WHERE booking_id=bid AND organization_id=org AND room_id=(line->>'room_id')::uuid AND check_in=(line->>'check_in')::date ORDER BY created_at,id LIMIT 1;
 SELECT coalesce(array_agg(x::uuid),ARRAY[]::uuid[]) INTO people FROM jsonb_array_elements_text(coalesce(line->'occupants','[]'::jsonb)) x;
 PERFORM public.link_reservation_customers(ARRAY[rid],payer,people,true);
 END LOOP;
 RETURN bid;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_booking(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_booking(jsonb,jsonb) TO authenticated,service_role;
COMMENT ON FUNCTION public.update_guest_contact(uuid,text,text,text,text,text,text) IS 'DEPRECATED: customer card edits use save_customer; historical reservation/booking snapshots remain unchanged.';