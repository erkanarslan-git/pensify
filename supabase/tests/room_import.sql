-- Room type management + WordPress import RPCs. ONE transaction, always ROLLBACK.
-- Run as a privileged role that may SET ROLE authenticated (CI database), like tenant_isolation.sql.
BEGIN;
CREATE FUNCTION pg_temp.eq(actual bigint, expected bigint, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual; END IF;
  RAISE NOTICE 'PASS %', label;
END $$;
CREATE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', _uid::text, true);
$$;
CREATE FUNCTION pg_temp.expect_fail(_sql text, _needle text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(_needle IN SQLERRM) > 0 THEN RAISE NOTICE 'PASS %', label; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: wrong error %', label, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error raised', label;
END $$;

INSERT INTO public.organizations(id, name, slug, timezone, default_currency, locale) VALUES
 ('a0000000-0000-0000-0000-00000000000a','Test A','test-a-imp','Europe/Berlin','EUR','de'),
 ('b0000000-0000-0000-0000-00000000000b','Test B','test-b-imp','Europe/Berlin','EUR','de');
INSERT INTO public.organization_members(organization_id, user_id, role) VALUES
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000002','reception'),
 ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000001','admin');
INSERT INTO public.cities(id, organization_id, name, country) VALUES
 ('c0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','Bünde','DE'),
 ('c0000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-00000000000b','CityB','DE');
INSERT INTO public.properties(id, organization_id, city_id, name, address) VALUES
 ('d0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','A1','x'),
 ('d0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','A2','x'),
 ('d0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b','B1','x');
INSERT INTO public.rooms(id, organization_id, property_id, number) VALUES
 ('e0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','1');

ALTER TABLE public.rooms DISABLE TRIGGER audit_trg;       -- fake users have no auth.users row
ALTER TABLE public.properties DISABLE TRIGGER audit_trg;
ALTER TABLE public.cities DISABLE TRIGGER audit_trg;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey; -- rolled back
DELETE FROM public.integration_outbox WHERE organization_id = 'a0000000-0000-0000-0000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');

-- 1/3. Same type name in two houses = two records; 4. same code twice in one house rejected
SELECT public.save_room_type_full('d0000000-0000-0000-0000-0000000000a1', NULL, 'Einzelzimmer', 'EZ', 1, 1, NULL, 40);
SELECT public.save_room_type_full('d0000000-0000-0000-0000-0000000000a2', NULL, 'Einzelzimmer', 'EZ', 1, 1, NULL, 45);
SELECT pg_temp.eq((SELECT count(*) FROM public.room_types WHERE organization_id='a0000000-0000-0000-0000-00000000000a' AND code='EZ'), 2, 'same name/code in two houses = two types');
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_full('d0000000-0000-0000-0000-0000000000a1', NULL, 'EZ 2', 'EZ', 1, 1, NULL, 40)$$, 'code_taken', 'duplicate code in one house rejected');
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_full('d0000000-0000-0000-0000-0000000000a1', NULL, 'X', 'X', 2, 3, NULL, 40)$$, 'invalid_base_occupancy', 'base occupancy > capacity rejected');

-- 2. Room type of another house cannot be assigned (bulk RPC + direct write)
SELECT pg_temp.expect_fail(format($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', %L, ARRAY['1'], NULL)$$,
  (SELECT id FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a2')), 'room_type_not_found', 'other house type rejected (RPC)');

-- 5/6. Bulk creates exact count; duplicate number rejected
SELECT pg_temp.eq(public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1',
  (SELECT id FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a1'), ARRAY['101','102','103','104','105'], 1), 5, 'bulk creates 5 rooms');
SELECT pg_temp.expect_fail(format($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', %L, ARRAY['105'], 1)$$,
  (SELECT id FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a1')), 'number_taken', 'duplicate room number rejected');

-- move rooms / deactivate
SELECT public.save_room_type_full('d0000000-0000-0000-0000-0000000000a1', NULL, 'Doppelzimmer', 'DZ', 2, 2, NULL, 60);
SELECT pg_temp.eq(public.move_rooms_to_type(
  (SELECT id FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a1' AND code='EZ'),
  (SELECT id FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a1' AND code='DZ')), 5, 'rooms moved to other type');
SELECT public.set_room_type_active((SELECT id FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a1' AND code='EZ'), false);
SELECT pg_temp.eq((SELECT count(*) FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a1' AND code='EZ' AND NOT active), 1, 'type deactivated');

-- Import: one new house + one existing house
\set batch '{"file_names":["Zimmers.csv"],"properties":[{"key":"bunde-semmelweg","name":"Pension Bünde — Semmelweg","city":"Bünde","address":"Semmelweg"},{"key":"existing","existing_id":"d0000000-0000-0000-0000-0000000000a2"}],"room_types":[{"key":"bunde-semmelweg|DZ","property_key":"bunde-semmelweg","name":"Doppelzimmer","code":"DZ","capacity":2},{"key":"existing|EZ","property_key":"existing","name":"Einzelzimmer","code":"EZ","capacity":1}],"rooms":[{"action":"create","external_id":"21612","property_key":"bunde-semmelweg","type_key":"bunde-semmelweg|DZ","number":"DZ-01","title":"Doppelzimmer in Bünde 01 (Semmelweg)","url":"https://x/1","needs_review":true},{"action":"create","external_id":"21614","property_key":"bunde-semmelweg","type_key":"bunde-semmelweg|DZ","number":"DZ-02","title":"t","url":"u","needs_review":true},{"action":"create","external_id":"21134","property_key":"existing","type_key":"existing|EZ","number":"EZ-01","title":"t","url":"u","needs_review":true},{"action":"skip","external_id":"99999"}]}'
SELECT set_config('test.r1', public.import_wp_rooms(:'batch'::jsonb)::text, true);
SELECT pg_temp.eq((current_setting('test.r1')::jsonb->>'properties_created')::bigint, 1, 'import created 1 house');
SELECT pg_temp.eq((current_setting('test.r1')::jsonb->>'rooms_created')::bigint, 3, 'import created 3 rooms');
SELECT pg_temp.eq((current_setting('test.r1')::jsonb->>'rooms_skipped')::bigint, 1, 'import skipped 1 room');
SELECT pg_temp.eq((SELECT count(*) FROM public.rooms WHERE external_source_id='21612' AND source_system='wordpress' AND source_url='https://x/1' AND floor IS NULL AND import_needs_review), 1, 'WP id, url kept; floor not invented');
SELECT pg_temp.eq((SELECT count(*) FROM public.audit_logs WHERE organization_id='a0000000-0000-0000-0000-00000000000a' AND action='wp_rooms_import'), 1, 'import audited');

-- 9. Same CSV again: no duplicates
SELECT set_config('test.r2', public.import_wp_rooms(:'batch'::jsonb)::text, true);
SELECT pg_temp.eq((current_setting('test.r2')::jsonb->>'rooms_created')::bigint, 0, 're-import creates no rooms');
SELECT pg_temp.eq((current_setting('test.r2')::jsonb->>'properties_created')::bigint, 0, 're-import creates no houses');
SELECT pg_temp.eq((SELECT count(*) FROM public.rooms WHERE organization_id='a0000000-0000-0000-0000-00000000000a' AND source_system='wordpress'), 3, 'still 3 imported rooms');

-- 12. Failure mid-batch leaves nothing behind
SELECT pg_temp.expect_fail($$SELECT public.import_wp_rooms('{"properties":[{"key":"n","name":"Neu","city":"Löhne","address":"Johanneskamp"}],"room_types":[{"key":"n|FEWO","property_key":"n","name":"Ferienwohnung","code":"FEWO","capacity":4}],"rooms":[{"action":"create","external_id":"1","property_key":"n","type_key":"n|FEWO","number":"F-1"},{"action":"create","external_id":"2","property_key":"n","type_key":"n|FEWO","number":"F-1"}]}'::jsonb)$$, 'number_taken', 'duplicate inside batch aborts');
SELECT pg_temp.eq((SELECT count(*) FROM public.properties WHERE name='Neu'), 0, 'failed import left no house');

-- 13. No channel events from import
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE organization_id='a0000000-0000-0000-0000-00000000000a'
  AND created_at >= now() AND payload::text LIKE '%wordpress%'), 0, 'import sent nothing to outbox');

-- 11. Tenant isolation: A cannot import into B's house or see B rooms
SELECT pg_temp.expect_fail($$SELECT public.import_wp_rooms('{"properties":[{"key":"x","existing_id":"d0000000-0000-0000-0000-0000000000b1"}],"room_types":[],"rooms":[]}'::jsonb)$$, 'property_not_found', 'A cannot import into B house');
SELECT pg_temp.eq((SELECT count(*) FROM public.rooms WHERE organization_id='b0000000-0000-0000-0000-00000000000b'), 0, 'A cannot see B rooms');

-- 10. Unauthorized: reception cannot import or manage types
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002');
SELECT pg_temp.expect_fail($$SELECT public.import_wp_rooms('{"properties":[],"room_types":[],"rooms":[]}'::jsonb)$$, 'forbidden', 'reception cannot import');
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_full('d0000000-0000-0000-0000-0000000000a1', NULL, 'R', 'R', 1, 1, NULL, 1)$$, 'forbidden', 'reception cannot create type');

ROLLBACK;
