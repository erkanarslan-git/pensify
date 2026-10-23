-- Requires privileged transactional test access. Everything rolls back.
BEGIN;
DO $$ DECLARE u uuid; org uuid; room record; res uuid; schedule uuid; request uuid:=gen_random_uuid(); receipt uuid; retained jsonb; rejected boolean; total numeric;
BEGIN
 SELECT user_id,organization_id INTO u,org FROM public.organization_members WHERE active AND role='owner' LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'test owner required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('app.skip_channel_outbox','true',true);
 SELECT r.* INTO room FROM public.rooms r WHERE r.organization_id=org AND r.active AND r.status<>'maintenance' LIMIT 1;
 IF room.id IS NULL THEN RAISE EXCEPTION 'test room required'; END IF;
 INSERT INTO public.reservations(organization_id,property_id,room_id,guest_name,check_in,check_out,status,channel,revenue)
 VALUES(org,room.property_id,room.id,'Reversible finance test','2035-01-01','2035-04-01','confirmed','direct',300) RETURNING id INTO res;
 INSERT INTO public.payment_schedules(reservation_id,due_date,amount) VALUES(res,'2035-01-01',100) RETURNING id INTO schedule;
 receipt:=public.collect_payment_receipt(request,res,120,'2035-01-01','cash','test',jsonb_build_array(jsonb_build_object('schedule_id',schedule,'amount',100)),'rent');
 PERFORM public.collect_payment_receipt(request,res,120,'2035-01-01','cash','test',jsonb_build_array(jsonb_build_object('schedule_id',schedule,'amount',100)),'rent');
 SELECT sum(amount) INTO total FROM public.payments WHERE receipt_id=receipt;
 IF total<>120 OR (SELECT count(*) FROM public.payment_receipts WHERE id=request)<>1 THEN RAISE EXCEPTION 'retry duplicated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payments WHERE receipt_id=receipt AND kind='unallocated' AND amount=20) THEN RAISE EXCEPTION 'advance missing'; END IF;
 rejected:=false;
 BEGIN PERFORM public.collect_payment_receipt(gen_random_uuid(),res,1,'2035-01-01','cash','test',jsonb_build_array(jsonb_build_object('schedule_id',schedule,'amount',1)),'rent'); EXCEPTION WHEN raise_exception THEN IF SQLERRM='allocation_exceeds_remaining' THEN rejected:=true; ELSE RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'over-allocation accepted'; END IF;
 retained:=jsonb_build_array(jsonb_build_object('id',schedule,'due_date','2035-01-01','amount',100));
 PERFORM public.replace_payment_plan(res,'[{"due_date":"2035-02-01","amount":100},{"due_date":"2035-03-01","amount":100}]',retained,ARRAY[]::text[]);
 PERFORM public.replace_payment_plan(res,'[{"due_date":"2035-02-01","amount":100},{"due_date":"2035-03-01","amount":100}]',retained,ARRAY[]::text[]);
 IF (SELECT count(*) FROM public.payment_schedules WHERE reservation_id=res)<>3 THEN RAISE EXCEPTION 'plan duplicated'; END IF;
 rejected:=false;
 BEGIN DELETE FROM public.reservations WHERE id=res; EXCEPTION WHEN raise_exception THEN IF SQLERRM='financial_history_requires_archive' THEN rejected:=true; ELSE RAISE; END IF; END;
 IF NOT rejected THEN RAISE EXCEPTION 'financial history deleted'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 rejected:=false; BEGIN PERFORM public.collect_payment_receipt(gen_random_uuid(),res,1,'2035-01-01','cash','test','[]','rent'); EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'foreign payment accepted'; END IF;
END $$;
ROLLBACK;