-- Reversible integration test; never commits employee assignments or worked hours.
BEGIN;
DO $$
DECLARE m public.organization_members; d text; c public.cleaners; ctx jsonb;
BEGIN
 SELECT * INTO m FROM public.organization_members WHERE active AND role='owner'
 AND NOT EXISTS(SELECT 1 FROM public.member_departments WHERE member_id=organization_members.id)
 AND NOT EXISTS(SELECT 1 FROM public.cleaners WHERE user_id=organization_members.user_id) LIMIT 1;
 IF m.id IS NULL THEN RAISE EXCEPTION 'test requires owner without employee assignment'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',m.user_id,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',m.user_id::text,true);
 ctx:=public.my_shift_context();
 IF ctx->>'status'<>'not_employee' THEN RAISE EXCEPTION 'owner must not clock without employee assignment'; END IF;
 FOREACH d IN ARRAY ARRAY['cleaning','maintenance','office','hr'] LOOP
  INSERT INTO public.member_departments(organization_id,member_id,department,is_worker,is_lead) VALUES(m.organization_id,m.id,d,true,false);
  SELECT * INTO c FROM public.cleaners WHERE user_id=m.user_id AND organization_id=m.organization_id;
  IF NOT c.time_tracking_enabled OR c.active THEN RAISE EXCEPTION 'department worker must clock without joining cleaning roster'; END IF;
  IF (SELECT role FROM public.organization_members WHERE id=m.id)<>'owner' THEN RAISE EXCEPTION 'owner role changed'; END IF;
  IF public.my_shift_context()->>'status'<>'employee' THEN RAISE EXCEPTION 'worker not recognized'; END IF;
  UPDATE public.member_departments SET is_worker=false,is_lead=true WHERE member_id=m.id AND department=d;
  IF public.my_shift_context()->>'status'<>'not_employee' THEN RAISE EXCEPTION 'lead alone must not clock'; END IF;
  DELETE FROM public.member_departments WHERE member_id=m.id AND department=d;
 END LOOP;
 RAISE NOTICE 'PASS department workers, lead-only, role retention and cleaning separation';
END $$;
ROLLBACK;