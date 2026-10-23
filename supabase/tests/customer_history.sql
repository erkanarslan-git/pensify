-- Privileged transactional acceptance test; fixtures never persist.
BEGIN;
DO $$
DECLARE u uuid; org uuid; room record; company uuid; person uuid; rid uuid; history jsonb; forbidden boolean; before_count bigint;
BEGIN
 SELECT user_id,organization_id INTO u,org FROM public.organization_members WHERE active AND role='owner' LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'test owner required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('app.skip_channel_outbox','true',true);
 SELECT r.* INTO room FROM public.rooms r WHERE r.organization_id=org AND r.active AND r.status<>'maintenance' LIMIT 1;
 company:=public.save_customer('{"kind":"company","name":"Rollback Company","email":"shared@example.test"}');
 person:=public.save_customer('{"kind":"person","name":"Rollback Person","email":"shared@example.test"}');
 IF company=person THEN RAISE EXCEPTION 'contacts merged'; END IF;
 INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,check_in,check_out,status,channel,revenue,guests_count)
 VALUES(org,room.property_id,room.id,'Historical snapshot','2037-01-01','2037-01-02','confirmed','direct',public.quote_room_price(room.id,'2037-01-01','2037-01-02',1),1) RETURNING id INTO rid;
 PERFORM public.link_reservation_customers(ARRAY[rid],company,ARRAY[person],true);
 history:=public.customer_history(_kind=>'company',_party=>company);
 IF (history->'rows'->0->>'stays')::int<>1 THEN RAISE EXCEPTION 'company history missing'; END IF;
 history:=public.customer_history(_kind=>'person',_party=>person);
 IF (history->'rows'->0->'reservations'->0) ? 'finance' THEN RAISE EXCEPTION 'occupant exposed payer finance'; END IF;
 PERFORM public.save_customer('{"kind":"person","name":"Updated Person"}',person);
 IF (SELECT guest_name FROM public.reservations WHERE id=rid)<>'Historical snapshot' THEN RAISE EXCEPTION 'historical snapshot mutated'; END IF;
 PERFORM public.link_reservation_customers(ARRAY[rid],person,ARRAY[person],true);
 history:=public.customer_history(_kind=>'company',_party=>company);
 IF jsonb_array_length(history->'rows'->0->'reservations')<>0 THEN RAISE EXCEPTION 'private stay counted for company'; END IF;
 SELECT count(*) INTO before_count FROM public.customer_parties WHERE organization_id=org;
 forbidden:=false;
 BEGIN
  PERFORM public.create_customer_booking('{"new_customer":{"kind":"person","name":"Failed atomic customer"}}','[]');
 EXCEPTION WHEN OTHERS THEN forbidden:=true;
 END;
 IF NOT forbidden OR (SELECT count(*) FROM public.customer_parties WHERE organization_id=org)<>before_count THEN RAISE EXCEPTION 'failed booking left customer'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 IF public.can_read_customer(org,person) THEN RAISE EXCEPTION 'foreign party visible'; END IF;
END $$;
ROLLBACK;