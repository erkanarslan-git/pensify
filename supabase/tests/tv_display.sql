-- Privileged, rollback-only check; never persists a display or changes business rows.
BEGIN;
DO $$
DECLARE org uuid; other_org uuid; token text:=repeat('b',64); result jsonb; display_id uuid; expected bigint;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE active ORDER BY created_at LIMIT 1;
 IF org IS NULL THEN RAISE EXCEPTION 'test requires an active organization'; END IF;
 IF has_table_privilege('anon','public.tv_displays','SELECT') THEN RAISE EXCEPTION 'display identities exposed'; END IF;
 IF has_function_privilege('anon','public.create_tv_display(text)','EXECUTE') THEN RAISE EXCEPTION 'anonymous creation allowed'; END IF;
 IF has_function_privilege('anon','public.revoke_tv_display(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anonymous revocation allowed'; END IF;
 IF public.tv_snapshot('invalid') IS NOT NULL OR public.tv_snapshot(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'invalid identity accepted'; END IF;
 INSERT INTO public.tv_displays(organization_id,name,token_hash,created_by) VALUES(org,'rollback test',encode(sha256(convert_to(token,'UTF8')),'hex'),gen_random_uuid()) RETURNING id INTO display_id;
 result:=public.tv_snapshot(token);
 IF result IS NULL THEN RAISE EXCEPTION 'valid display denied'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(result))<>9 THEN RAISE EXCEPTION 'unexpected display fields'; END IF;
 IF result::text ~ 'guest_name|guest_phone|actor_email|access_code|clock_in|payer_ibans|recorded_by|revenue|remaining' THEN RAISE EXCEPTION 'private fields exposed'; END IF;
 SELECT count(*) INTO expected FROM public.rooms r JOIN public.properties p ON p.id=r.property_id AND p.active WHERE r.organization_id=org AND r.active;
 IF (result->'totals'->>'total')::bigint<>expected THEN RAISE EXCEPTION 'wrong organization room count'; END IF;
 UPDATE public.tv_displays SET revoked_at=now() WHERE id=display_id;
 IF public.tv_snapshot(token) IS NOT NULL THEN RAISE EXCEPTION 'revoked identity accepted'; END IF;
END $$;
ROLLBACK;