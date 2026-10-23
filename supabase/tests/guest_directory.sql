-- Privileged transactional check; all fixtures roll back.
BEGIN;
DO $$ DECLARE u uuid; org uuid; room record; first_id uuid; second_id uuid; result jsonb; rejected boolean;
BEGIN
 SELECT user_id,organization_id INTO u,org FROM public.organization_members WHERE active AND role='owner' LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'test owner required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('app.skip_channel_outbox','true',true);
 SELECT r.* INTO room FROM public.rooms r WHERE r.organization_id=org AND r.active AND r.status<>'maintenance' LIMIT 1;
 INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,guest_email,check_in,check_out,status,channel,revenue) VALUES(org,room.property_id,room.id,'Reversible directory test','shared@example.test','2036-01-01','2036-01-02','confirmed','direct',public.quote_room_price(room.id,'2036-01-01','2036-01-02',1)) RETURNING id INTO first_id;
 INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,guest_email,check_in,check_out,status,channel,revenue) VALUES(org,room.property_id,room.id,'Reversible directory test','shared@example.test','2036-01-03','2036-01-04','confirmed','direct',public.quote_room_price(room.id,'2036-01-03','2036-01-04',1)) RETURNING id INTO second_id;
 result:=public.guest_directory('Reversible directory test','all',0,10);
 IF (result->>'total')::int<>2 THEN RAISE EXCEPTION 'contacts merged'; END IF;
 PERFORM public.update_guest_contact(first_id,'changed@example.test','123','','','','');
 IF (SELECT guest_email FROM public.reservations WHERE id=first_id)<>'changed@example.test' THEN RAISE EXCEPTION 'contact not saved'; END IF;
 IF has_table_privilege('authenticated','public.operational_access_secrets','SELECT') OR has_table_privilege('anon','public.operational_access_secrets','SELECT') THEN RAISE EXCEPTION 'raw secret privilege'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 rejected:=false; BEGIN PERFORM public.update_guest_contact(first_id,'evil@example.test','','','','',''); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'foreign guest edit accepted'; END IF;
 rejected:=false; BEGIN PERFORM public.reveal_access_secret(room.property_id,room.id,'door'); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'foreign code accepted'; END IF;
END $$;
ROLLBACK;