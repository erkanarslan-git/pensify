-- Room type + bulk room RPCs (save_room_type_with_plan, create_rooms_bulk).
-- ONE transaction, always ROLLBACK. Run as a privileged role that may SET ROLE authenticated.
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
-- Runs _sql, expects it to fail with a message containing _needle.
CREATE FUNCTION pg_temp.expect_fail(_sql text, _needle text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(_needle IN SQLERRM) > 0 THEN RAISE NOTICE 'PASS %', label; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: wrong error %', label, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error raised', label;
END $$;

-- Fixtures: org A (admin, reception, property_manager w/o access), org B
INSERT INTO public.organizations(id, name, slug, timezone, default_currency, locale) VALUES
 ('a0000000-0000-0000-0000-00000000000a','Test A','test-a-rooms','Europe/Berlin','EUR','de'),
 ('b0000000-0000-0000-0000-00000000000b','Test B','test-b-rooms','Europe/Berlin','EUR','de');
INSERT INTO public.organization_members(organization_id, user_id, role) VALUES
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000002','reception'),
 ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000001','admin');
INSERT INTO public.cities(id, organization_id, name, country) VALUES
 ('c0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','CityA','DE'),
 ('c0000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-00000000000b','CityB','DE');
INSERT INTO public.properties(id, organization_id, city_id, name, address) VALUES
 ('d0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','A1','x'),
 ('d0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','A2','x'),
 ('d0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b','B1','x');
INSERT INTO public.room_types(id, organization_id, property_id, name, code, capacity) VALUES
 ('f0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a2','DZ A2','DZ',2),
 ('f0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','DZ B1','DZ',2);

-- fake users have no auth.users row; audit FK would reject them (rolled back anyway)
ALTER TABLE public.rooms DISABLE TRIGGER audit_trg;
SET LOCAL ROLE authenticated;

-- 1. Admin creates a type + plan atomically
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT set_config('test.type_id', public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', NULL, 'Doppelzimmer', 2, 80)::text, true);
SELECT pg_temp.eq((SELECT count(*) FROM public.rate_plans WHERE room_type_id = current_setting('test.type_id')::uuid AND base_price = 80 AND property_id='d0000000-0000-0000-0000-0000000000a1'), 1, 'type created with one rate plan in same property');

-- 2. Update changes price, no second plan
SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, 'Doppelzimmer', 2, 95);
SELECT pg_temp.eq((SELECT count(*) FROM public.rate_plans WHERE room_type_id = current_setting('test.type_id')::uuid), 1, 'update keeps a single plan');
SELECT pg_temp.eq((SELECT base_price::bigint FROM public.rate_plans WHERE room_type_id = current_setting('test.type_id')::uuid), 95, 'price updated');

-- 3. Same name again gets a unique code (no constraint error)
SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', NULL, 'Doppelzimmer', 2, 70);
SELECT pg_temp.eq((SELECT count(DISTINCT code) FROM public.room_types WHERE property_id='d0000000-0000-0000-0000-0000000000a1'), 2, 'duplicate names get unique codes');

-- 4. Validation
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', NULL, '  ', 2, 50)$$, 'invalid_name', 'empty name rejected');
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', NULL, 'X', 0, 50)$$, 'invalid_capacity', 'capacity 0 rejected');
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', NULL, 'X', 2, -1)$$, 'invalid_price', 'negative price rejected');

-- 5. Type from another property of same org cannot be edited via wrong property
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000a2', 'X', 2, 50)$$, 'room_type_not_found', 'type/property mismatch rejected');

-- 6. Cross-tenant: A admin cannot touch org B
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000b1', NULL, 'Hack', 2, 1)$$, 'forbidden', 'cross-org type create rejected');
SELECT pg_temp.expect_fail($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000b1', ARRAY['1'], 0)$$, 'forbidden', 'cross-org bulk rooms rejected');

-- 7. Bulk rooms: atomic and validated
SELECT pg_temp.eq(public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, ARRAY['1','2','3'], 1), 3, 'bulk creates 3 rooms');
SELECT pg_temp.eq((SELECT count(*) FROM public.rooms WHERE property_id='d0000000-0000-0000-0000-0000000000a1' AND capacity=2 AND organization_id='a0000000-0000-0000-0000-00000000000a'), 3, 'rooms inherit capacity + org');
SELECT pg_temp.expect_fail($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, ARRAY['4','3'], 1)$$, 'number_taken', 'existing number rejected');
SELECT pg_temp.eq((SELECT count(*) FROM public.rooms WHERE property_id='d0000000-0000-0000-0000-0000000000a1' AND number='4'), 0, 'failed bulk inserted nothing (atomic)');
SELECT pg_temp.expect_fail($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, ARRAY['7','7'], 1)$$, 'duplicate_number', 'duplicate in input rejected');
SELECT pg_temp.expect_fail($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, ARRAY[]::text[], 1)$$, 'invalid_count', 'empty list rejected');
SELECT pg_temp.expect_fail($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000a2', ARRAY['9'], 1)$$, 'room_type_not_found', 'type of other property rejected');

-- 8. Capacity cannot drop below existing rooms
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, 'Doppelzimmer', 1, 95)$$, 'capacity_below_rooms', 'capacity shrink below rooms rejected');

-- 9. Reception has no manage_rooms permission
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002');
SELECT pg_temp.expect_fail($$SELECT public.save_room_type_with_plan('d0000000-0000-0000-0000-0000000000a1', NULL, 'R', 2, 10)$$, 'forbidden', 'reception cannot create type');
SELECT pg_temp.expect_fail($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, ARRAY['20'], 0)$$, 'forbidden', 'reception cannot create rooms');

-- 10. Anonymous (no user) rejected
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.expect_fail($$SELECT public.create_rooms_bulk('d0000000-0000-0000-0000-0000000000a1', current_setting('test.type_id')::uuid, ARRAY['21'], 0)$$, 'not_authenticated', 'no user rejected');

ROLLBACK;
