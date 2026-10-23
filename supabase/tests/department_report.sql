-- Privileged integration test; synthetic users, no persistent changes.
BEGIN;
DO $$ BEGIN
 IF (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='member_departments' AND column_name='lead_can_report') IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'report permission must default off'; END IF;
END $$;
INSERT INTO public.organizations(id,name,slug) VALUES
 ('de000000-0000-0000-0000-000000000001','Report A','report-test-a'),
 ('de000000-0000-0000-0000-000000000002','Report B','report-test-b');
ALTER TABLE public.organization_members DISABLE TRIGGER membership_cleaner_profile;
INSERT INTO public.organization_members(id,organization_id,user_id,role,active) VALUES
 ('de100000-0000-0000-0000-000000000001','de000000-0000-0000-0000-000000000001','de200000-0000-0000-0000-000000000001','cleaner',true),
 ('de100000-0000-0000-0000-000000000002','de000000-0000-0000-0000-000000000002','de200000-0000-0000-0000-000000000002','owner',true);
ALTER TABLE public.organization_members ENABLE TRIGGER membership_cleaner_profile;
ALTER TABLE public.member_departments DISABLE TRIGGER audit_trg;
INSERT INTO public.member_departments(organization_id,member_id,department,is_worker,is_lead,lead_can_report) VALUES
 ('de000000-0000-0000-0000-000000000001','de100000-0000-0000-0000-000000000001','cleaning',false,true,true);
SELECT set_config('request.jwt.claim.sub','de200000-0000-0000-0000-000000000001',true);
DO $$ DECLARE r jsonb; BEGIN
 IF cardinality(public.my_report_teams())<>0 THEN RAISE EXCEPTION 'lead report grant must not allow special report'; END IF;
 BEGIN
  r:=public.department_work_report(current_date,current_date);
  RAISE EXCEPTION 'lead report returned data';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.department_work_report(current_date,current_date,'de900000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'foreign property allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.member_departments SET lead_can_report=false WHERE member_id='de100000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF cardinality(public.my_report_teams())<>0 THEN RAISE EXCEPTION 'disabled report power allowed'; END IF;
 BEGIN
  PERFORM public.department_work_report(current_date,current_date);
  RAISE EXCEPTION 'disabled report returned data';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.member_departments SET lead_can_report=true,is_lead=false WHERE member_id='de100000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF cardinality(public.my_report_teams())<>0 THEN RAISE EXCEPTION 'worker-only report allowed'; END IF;
END $$;
UPDATE public.member_departments SET is_lead=true WHERE member_id='de100000-0000-0000-0000-000000000001';
UPDATE public.organization_members SET active=false WHERE id='de100000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF coalesce(cardinality(public.my_report_teams()),0)<>0 THEN RAISE EXCEPTION 'inactive lead allowed'; END IF;
END $$;
UPDATE public.organization_members SET active=true WHERE id='de100000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub','de200000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF public.my_report_teams() IS DISTINCT FROM ARRAY['all','cleaning','office','maintenance']::text[] THEN RAISE EXCEPTION 'owner scope mismatch'; END IF;
 BEGIN
  PERFORM public.department_work_report(current_date,current_date,'de900000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'owner allowed foreign or unknown property';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.organization_members SET role='admin' WHERE id='de100000-0000-0000-0000-000000000002';
DO $$ BEGIN
 IF cardinality(public.my_report_teams())<>0 THEN RAISE EXCEPTION 'admin must not access special report'; END IF;
 BEGIN
  PERFORM public.department_work_report(current_date,current_date);
  RAISE EXCEPTION 'admin report returned data';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.organization_members SET role='reception' WHERE id='de100000-0000-0000-0000-000000000002';
INSERT INTO public.member_departments(organization_id,member_id,department,is_worker,is_lead) VALUES
 ('de000000-0000-0000-0000-000000000002','de100000-0000-0000-0000-000000000002','hr',true,false);
DO $$ BEGIN
 IF coalesce(cardinality(public.my_report_teams()),0)<>0 THEN RAISE EXCEPTION 'HR must require explicit report access'; END IF;
END $$;
UPDATE public.member_departments SET lead_can_report=true WHERE member_id='de100000-0000-0000-0000-000000000002' AND department='hr';
DO $$ BEGIN
 IF cardinality(public.my_report_teams())<>0 THEN RAISE EXCEPTION 'HR grant must not allow special report'; END IF;
 BEGIN
  PERFORM public.department_work_report(current_date,current_date);
  RAISE EXCEPTION 'HR report returned data';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','de200000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.department_work_report(current_date,current_date);
  RAISE EXCEPTION 'unaffiliated user returned data';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;