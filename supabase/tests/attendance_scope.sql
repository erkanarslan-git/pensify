-- Privileged transaction-only test: never persists staff or organization changes.
BEGIN;
ALTER TABLE public.organization_members DISABLE TRIGGER USER;
ALTER TABLE public.member_departments DISABLE TRIGGER USER;
INSERT INTO public.organizations(id,name,slug) VALUES
 ('ad000000-0000-0000-0000-000000000001','Attendance A','attendance-scope-test-a'),
 ('ad000000-0000-0000-0000-000000000002','Attendance B','attendance-scope-test-b');
INSERT INTO public.organization_members(id,organization_id,user_id,role,active) VALUES
 ('ad100000-0000-0000-0000-000000000001','ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000001','reception',true),
 ('ad100000-0000-0000-0000-000000000002','ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000002','reception',true),
 ('ad100000-0000-0000-0000-000000000003','ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000003','reception',true),
 ('ad100000-0000-0000-0000-000000000004','ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000004','reception',true),
 ('ad100000-0000-0000-0000-000000000005','ad000000-0000-0000-0000-000000000002','ad200000-0000-0000-0000-000000000005','owner',true);
INSERT INTO public.member_departments(organization_id,member_id,department,is_worker,is_lead,lead_can_fix_time) VALUES
 ('ad000000-0000-0000-0000-000000000001','ad100000-0000-0000-0000-000000000001','office',false,true,true),
 ('ad000000-0000-0000-0000-000000000001','ad100000-0000-0000-0000-000000000002','office',true,false,false),
 ('ad000000-0000-0000-0000-000000000001','ad100000-0000-0000-0000-000000000003','maintenance',true,false,false),
 ('ad000000-0000-0000-0000-000000000001','ad100000-0000-0000-0000-000000000004','hr',false,true,false);
SELECT set_config('request.jwt.claim.sub','ad200000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
 IF NOT public.can_read_employee_time('ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000002',NULL) THEN RAISE EXCEPTION 'office lead denied own worker'; END IF;
 IF public.can_read_employee_time('ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000003',NULL) THEN RAISE EXCEPTION 'maintenance leaked to office lead'; END IF;
 IF public.can_read_employee_time('ad000000-0000-0000-0000-000000000002','ad200000-0000-0000-0000-000000000005',NULL) THEN RAISE EXCEPTION 'foreign org leaked'; END IF;
 IF public.can_read_employee_time('ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000002','ad900000-0000-0000-0000-000000000009') THEN RAISE EXCEPTION 'inaccessible property allowed'; END IF;
END $$;
UPDATE public.member_departments SET lead_can_fix_time=false WHERE member_id='ad100000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF public.can_read_employee_time('ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000002',NULL) THEN RAISE EXCEPTION 'disabled time power allowed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','ad200000-0000-0000-0000-000000000004',true);
DO $$ BEGIN
 IF NOT public.can_read_employee_time('ad000000-0000-0000-0000-000000000001','ad200000-0000-0000-0000-000000000003',NULL) THEN RAISE EXCEPTION 'HR denied maintenance'; END IF;
 IF public.can_read_employee_time('ad000000-0000-0000-0000-000000000002','ad200000-0000-0000-0000-000000000005',NULL) THEN RAISE EXCEPTION 'HR foreign org leaked'; END IF;
 BEGIN
  PERFORM public.employee_attendance_board('2026-01-01','2027-01-03');
  RAISE EXCEPTION 'oversized date range accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid_range' THEN RAISE; END IF; END;
END $$;
ROLLBACK;