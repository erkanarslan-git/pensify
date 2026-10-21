BEGIN;
INSERT INTO public.organizations(id,name,slug) VALUES ('fa000000-0000-0000-0000-000000000001','Attendance test A','attendance-test-a'),('fa000000-0000-0000-0000-000000000002','Attendance test B','attendance-test-b');
INSERT INTO public.organization_members(id,organization_id,user_id,role) VALUES
('fb000000-0000-0000-0000-000000000001','fa000000-0000-0000-0000-000000000001','fc000000-0000-0000-0000-000000000001','owner'),
('fb000000-0000-0000-0000-000000000002','fa000000-0000-0000-0000-000000000002','fc000000-0000-0000-0000-000000000002','owner'),
('fb000000-0000-0000-0000-000000000003','fa000000-0000-0000-0000-000000000001','fc000000-0000-0000-0000-000000000003','cleaner');
ALTER TABLE public.employee_work_schedules DISABLE TRIGGER audit_trg;
ALTER TABLE public.employee_absences DISABLE TRIGGER audit_trg;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fc000000-0000-0000-0000-000000000001',true);
INSERT INTO public.employee_work_schedules(organization_id,member_id,effective_from,weekdays) VALUES ('fa000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000003','2026-10-01',ARRAY[1,2,3,4,5]);
INSERT INTO public.employee_absences(organization_id,member_id,start_date,end_date,kind) VALUES ('fa000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000003','2026-10-26','2026-10-26','sick');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.time_entries WHERE organization_id='fa000000-0000-0000-0000-000000000001') <> 0 THEN RAISE EXCEPTION 'absence created work hours'; END IF;
  BEGIN
    INSERT INTO public.employee_absences(organization_id,member_id,start_date,end_date,kind) VALUES ('fa000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000003','2026-10-26','2026-10-27','leave');
    RAISE EXCEPTION 'overlap accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.employee_work_schedules(organization_id,member_id,effective_from,weekdays) VALUES ('fa000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000003','2026-11-01',ARRAY[8]);
    RAISE EXCEPTION 'invalid weekday accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.employee_work_schedules(organization_id,member_id,effective_from,weekdays) VALUES ('fa000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000002','2026-11-01',ARRAY[1]);
    RAISE EXCEPTION 'cross tenant employee accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.employee_absences SET cancelled=true WHERE member_id='fb000000-0000-0000-0000-000000000003';
    RAISE EXCEPTION 'cancellation without reason accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','fc000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.employee_absences WHERE organization_id='fa000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'tenant leakage'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','fc000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.employee_absences WHERE member_id='fb000000-0000-0000-0000-000000000003')<>1 THEN RAISE EXCEPTION 'self read denied'; END IF;
 BEGIN
  INSERT INTO public.employee_absences(organization_id,member_id,start_date,end_date,kind) VALUES ('fa000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000003','2026-11-02','2026-11-02','sick');
  RAISE EXCEPTION 'cleaner can manage absence';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;