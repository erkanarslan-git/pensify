-- Run as a privileged test role. Uses tenant suite fixtures; always rolls back.
BEGIN;
INSERT INTO public.organizations(id,name,slug) VALUES ('da000000-0000-0000-0000-000000000001','Assignment test','assignment-test');
ALTER TABLE public.organization_members DISABLE TRIGGER membership_cleaner_profile;
INSERT INTO public.organization_members(id,organization_id,user_id,role,active) VALUES
 ('da100000-0000-0000-0000-000000000001','da000000-0000-0000-0000-000000000001','da200000-0000-0000-0000-000000000001','cleaner',true),
 ('da100000-0000-0000-0000-000000000002','da000000-0000-0000-0000-000000000001','da200000-0000-0000-0000-000000000002','cleaner',true),
 ('da100000-0000-0000-0000-000000000003','da000000-0000-0000-0000-000000000001','da200000-0000-0000-0000-000000000003','cleaner',false);
ALTER TABLE public.organization_members ENABLE TRIGGER membership_cleaner_profile;
ALTER TABLE public.member_departments DISABLE TRIGGER audit_trg;
INSERT INTO public.member_departments(organization_id,member_id,department,is_worker,is_lead,lead_can_assign) VALUES
 ('da000000-0000-0000-0000-000000000001','da100000-0000-0000-0000-000000000001','cleaning',false,true,true),
 ('da000000-0000-0000-0000-000000000001','da100000-0000-0000-0000-000000000002','cleaning',true,false,false),
 ('da000000-0000-0000-0000-000000000001','da100000-0000-0000-0000-000000000003','cleaning',true,false,false);
SELECT set_config('request.jwt.claim.sub','da200000-0000-0000-0000-000000000001',true);
DO $$ BEGIN
 IF NOT public.has_department_assignment('da000000-0000-0000-0000-000000000001','cleaning','da200000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'active department worker denied'; END IF;
 IF public.has_department_assignment('da000000-0000-0000-0000-000000000001','maintenance','da200000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'other department allowed'; END IF;
 IF public.has_department_assignment('da000000-0000-0000-0000-000000000001','cleaning','da200000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'inactive worker allowed'; END IF;
 IF public.has_department_assignment('da000000-0000-0000-0000-000000000099','cleaning','da200000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'other organization allowed'; END IF;
END $$;
UPDATE public.member_departments SET lead_can_assign=false WHERE member_id='da100000-0000-0000-0000-000000000001';
DO $$ BEGIN
 IF public.has_department_assignment('da000000-0000-0000-0000-000000000001','cleaning','da200000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'disabled power allowed'; END IF;
END $$;
ROLLBACK;