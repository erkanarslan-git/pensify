-- Rolled-back integration test; does not create or delete login accounts.
BEGIN;
DO $$
DECLARE v_user uuid; v_org uuid := gen_random_uuid(); v_cleaner uuid; v_count integer;
BEGIN
 SELECT p.id INTO v_user FROM public.profiles p WHERE NOT EXISTS(SELECT 1 FROM public.cleaners c WHERE c.user_id=p.id) LIMIT 1;
 IF v_user IS NULL THEN RAISE EXCEPTION 'Test requires one existing non-cleaner profile'; END IF;
 INSERT INTO public.organizations(id,name,slug) VALUES(v_org,'Cleaner role test','cleaner-role-test-'||v_org);
 INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(v_org,v_user,'cleaner');
 SELECT id INTO v_cleaner FROM public.cleaners WHERE organization_id=v_org AND user_id=v_user AND active;
 IF v_cleaner IS NULL THEN RAISE EXCEPTION 'Cleaner role did not provision a linked profile'; END IF;
 UPDATE public.organization_members SET role='reception' WHERE organization_id=v_org AND user_id=v_user;
 IF EXISTS(SELECT 1 FROM public.cleaners WHERE id=v_cleaner AND active) THEN RAISE EXCEPTION 'Former cleaner remained active'; END IF;
 UPDATE public.organization_members SET role='cleaner' WHERE organization_id=v_org AND user_id=v_user;
 SELECT count(*) INTO v_count FROM public.cleaners WHERE organization_id=v_org AND user_id=v_user;
 IF v_count <> 1 THEN RAISE EXCEPTION 'Changing role created a duplicate profile'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cleaners WHERE id=v_cleaner AND active) THEN RAISE EXCEPTION 'Original cleaner profile was not preserved'; END IF;
 RAISE NOTICE 'PASS automatic provision, deactivation and idempotent reactivation';
END $$;
ROLLBACK;