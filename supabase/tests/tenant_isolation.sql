-- Tenant isolation test suite. Runs in ONE transaction and always ROLLBACKs (leaves no data).
-- Run as a privileged database role that may SET ROLE authenticated.
-- Any failed assertion raises an exception and aborts the run.
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

-- ---------- Fixtures (org A = new, org B = new; independent of production data) ----------
INSERT INTO public.organizations(id, name, slug, timezone, default_currency, locale) VALUES
 ('a0000000-0000-0000-0000-00000000000a', 'Test A', 'test-a-iso', 'Europe/Berlin', 'EUR', 'de'),
 ('b0000000-0000-0000-0000-00000000000b', 'Test B', 'test-b-iso', 'Europe/Istanbul', 'EUR', 'de');

-- fake user ids (organization_members has no FK to auth.users)
-- A admin, B admin, B property_manager (assigned P_B1), B reception (none), B cleaner (none), B cleaner w/ task
INSERT INTO public.organization_members(id, organization_id, user_id, role) VALUES
 ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('10000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000001','admin'),
 ('10000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','property_manager'),
 ('10000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000003','reception'),
 ('10000000-0000-0000-0000-000000000005','b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000004','cleaner');

INSERT INTO public.cities(id, organization_id, name, country) VALUES
 ('c0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','CityA','DE'),
 ('c0000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-00000000000b','CityB','DE');
INSERT INTO public.properties(id, organization_id, city_id, name, address) VALUES
 ('d0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','PA1','x'),
 ('d0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b','PB1','x'),
 ('d0000000-0000-0000-0000-0000000000b2','b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b','PB2','x');
INSERT INTO public.member_property_access(organization_id, member_id, property_id) VALUES
 ('b0000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-0000000000b1');
INSERT INTO public.rooms(id, organization_id, property_id, number) VALUES
 ('e0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','1'),
 ('e0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','1'),
 ('e0000000-0000-0000-0000-0000000000b2','b0000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b2','1');
INSERT INTO public.reservations(organization_id, room_id, property_id, guest_name, check_in, check_out, channel, external_id) VALUES
 ('a0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-0000000000a1','GA', current_date+30, current_date+32, 'ical', 'X1'),
 ('b0000000-0000-0000-0000-00000000000b','e0000000-0000-0000-0000-0000000000b1','d0000000-0000-0000-0000-0000000000b1','GB1', current_date+30, current_date+32, 'ical', 'X1'),
 ('b0000000-0000-0000-0000-00000000000b','e0000000-0000-0000-0000-0000000000b2','d0000000-0000-0000-0000-0000000000b2','GB2', current_date+30, current_date+32, 'ical', 'X2');

-- Identical settings keys in two organizations must not conflict
INSERT INTO public.app_settings(organization_id, key, value) VALUES
 ('a0000000-0000-0000-0000-00000000000a','dispatch.enabled','true'),
 ('b0000000-0000-0000-0000-00000000000b','dispatch.enabled','false');
INSERT INTO public.role_permissions(organization_id, role, permission, allowed) VALUES
 ('a0000000-0000-0000-0000-00000000000a','reception','view_finance',true),
 ('b0000000-0000-0000-0000-00000000000b','reception','view_finance',false);
SELECT pg_temp.eq((SELECT count(*) FROM public.app_settings WHERE key='dispatch.enabled' AND organization_id IN ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b')), 2, 'identical setting keys per org');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations WHERE external_id='X1' AND organization_id IN ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b')), 2, 'identical external ids per org');

-- Service-role style context (no user) gets NO default organization
SELECT pg_temp.eq((SELECT count(*) FROM (SELECT public.default_organization_id() AS o) s WHERE o IS NULL), 1, 'no default org without user');

SET LOCAL ROLE authenticated;

-- ---------- Tenant A admin ----------
SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations WHERE organization_id='b0000000-0000-0000-0000-00000000000b'), 0, 'A cannot SELECT B reservations');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations WHERE organization_id='a0000000-0000-0000-0000-00000000000a'), 1, 'A sees own reservation');
SELECT pg_temp.eq((SELECT count(*) FROM public.app_settings WHERE organization_id='b0000000-0000-0000-0000-00000000000b'), 0, 'A cannot read B settings');
DO $$ BEGIN
  INSERT INTO public.reservations(organization_id, room_id, property_id, guest_name, check_in, check_out, channel)
  VALUES ('b0000000-0000-0000-0000-00000000000b','e0000000-0000-0000-0000-0000000000b1','d0000000-0000-0000-0000-0000000000b1','evil', current_date+60, current_date+61, 'phone');
  RAISE EXCEPTION 'FAIL A inserted into B';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN RAISE NOTICE 'PASS A cannot INSERT into B';
END $$;
DO $$ DECLARE n int; BEGIN
  UPDATE public.reservations SET guest_name='hacked' WHERE organization_id='b0000000-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL A updated % B rows', n; END IF;
  RAISE NOTICE 'PASS A cannot UPDATE B';
END $$;
DO $$ BEGIN
  INSERT INTO public.app_settings(key, value) VALUES ('x','1'); -- A has exactly one org → default resolves to A
  IF NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key='x' AND organization_id='a0000000-0000-0000-0000-00000000000a') THEN RAISE EXCEPTION 'FAIL default org'; END IF;
  RAISE NOTICE 'PASS single-membership default resolves to own org';
END $$;
SELECT pg_temp.eq((SELECT count(*) FROM public.admin_list_cleaner_rates()), 0, 'A admin RPC sees only own org');

-- ---------- Legacy global owner has no power in org B ----------
SELECT pg_temp.as_user((SELECT user_id FROM public.user_roles WHERE role='owner' LIMIT 1));
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations WHERE organization_id='b0000000-0000-0000-0000-00000000000b'), 0, 'legacy global owner cannot read B');
SELECT pg_temp.eq((SELECT count(*) FROM public.audit_logs WHERE organization_id='b0000000-0000-0000-0000-00000000000b'), 0, 'legacy global owner cannot read B audit');
SELECT pg_temp.eq((SELECT count(*) FROM (SELECT public.has_organization_permission('b0000000-0000-0000-0000-00000000000b','manage_team') p) s WHERE p), 0, 'legacy global owner has no B permission');

-- ---------- Property manager: assigned property only ----------
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations), 1, 'property_manager sees only assigned property reservations');
SELECT pg_temp.eq((SELECT count(*) FROM public.properties WHERE id='d0000000-0000-0000-0000-0000000000b2'), 0, 'property_manager cannot see unassigned property');

-- ---------- Reception without assignment ----------
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000003');
SELECT pg_temp.eq((SELECT count(*) FROM public.properties), 0, 'reception without assignment: no properties');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations), 0, 'reception without assignment: no reservations');

-- ---------- Cleaner without assignment ----------
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000004');
SELECT pg_temp.eq((SELECT count(*) FROM public.properties), 0, 'cleaner without assignment: no properties');
SELECT pg_temp.eq((SELECT count(*) FROM public.list_my_clock_properties()), 0, 'cleaner without assignment: no clock properties');

-- ---------- Organization B admin ----------
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations), 2, 'B admin sees all B reservations');
SELECT pg_temp.eq((SELECT count(*) FROM public.role_permissions WHERE role='reception' AND permission='view_finance' AND allowed), 0, 'B sees only its own role override');

-- ---------- User with no membership: fail closed ----------
SELECT pg_temp.as_user('cccccccc-0000-0000-0000-000000000009');
DO $$ BEGIN
  INSERT INTO public.app_settings(key, value) VALUES ('y','1');
  RAISE EXCEPTION 'FAIL write without organization context';
EXCEPTION WHEN not_null_violation OR insufficient_privilege THEN RAISE NOTICE 'PASS write without organization fails closed';
END $$;

ROLLBACK;
