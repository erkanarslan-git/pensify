-- Pricing, capacity, WuBook property mapping and price-audit tests. ONE transaction, always ROLLBACK.
-- Run as a privileged role that may SET ROLE authenticated. Any failed assertion aborts the run.
BEGIN;

CREATE FUNCTION pg_temp.eq(actual numeric, expected numeric, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual; END IF;
  RAISE NOTICE 'PASS %', label;
END $$;
CREATE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  SELECT set_config('request.jwt.claim.sub', _uid::text, true);
$$;

-- ---------- Fixtures ----------
INSERT INTO public.organizations(id, name, slug, timezone, default_currency, locale) VALUES
 ('a0000000-0000-0000-0000-00000000000a', 'Test A', 'test-a-price', 'Europe/Berlin', 'EUR', 'de'),
 ('b0000000-0000-0000-0000-00000000000b', 'Test B', 'test-b-price', 'Europe/Berlin', 'EUR', 'de');
INSERT INTO public.organization_members(organization_id, user_id, role) VALUES
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','admin'),
 ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000001','admin');
INSERT INTO public.cities(id, organization_id, name, country) VALUES
 ('c0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','CityA','DE'),
 ('c0000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-00000000000b','CityB','DE');
INSERT INTO public.properties(id, organization_id, city_id, name, address) VALUES
 ('d0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','PA1','x'),
 ('d0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','PA2','x'),
 ('d0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b','PB1','x');
INSERT INTO public.room_types(id, organization_id, name, code, capacity) VALUES
 ('f0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','Doppel','DZ',2);
INSERT INTO public.rate_plans(id, organization_id, room_type_id, name, code, base_price) VALUES
 ('f1000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-0000000000a1','Standard','STD',100);
INSERT INTO public.occupancy_rates(organization_id, rate_plan_id, date, guest_count, price) VALUES
 ('a0000000-0000-0000-0000-00000000000a','f1000000-0000-0000-0000-0000000000a1', current_date+10, NULL, 120),
 ('a0000000-0000-0000-0000-00000000000a','f1000000-0000-0000-0000-0000000000a1', current_date+10, 2, 150);
INSERT INTO public.rooms(id, organization_id, property_id, number, capacity, room_type_id) VALUES
 ('e0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','1',4,'f0000000-0000-0000-0000-0000000000a1');

DO $$ BEGIN
  INSERT INTO public.occupancy_rates(organization_id, rate_plan_id, date, guest_count, price)
  VALUES ('a0000000-0000-0000-0000-00000000000a','f1000000-0000-0000-0000-0000000000a1', current_date+10, 2, 99);
  RAISE EXCEPTION 'FAIL duplicate guest-count price';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS one price per plan+date+guest_count';
END $$;

-- ---------- Room capacity (server-side, also for trusted/no-user writes) ----------
DO $$ BEGIN
  INSERT INTO public.reservations(organization_id, room_id, property_id, guest_name, guests_count, check_in, check_out, channel)
  VALUES ('a0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-0000000000a1','Cap', 3, current_date+40, current_date+41, 'phone');
  RAISE EXCEPTION 'FAIL insert above capacity';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS insert above capacity rejected';
END $$;

-- ---------- WuBook: one account, many property mappings ----------
INSERT INTO public.channel_accounts(id, organization_id, provider) VALUES
 ('a1000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','wubook'),
 ('b1000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-00000000000b','wubook');
DO $$ BEGIN
  INSERT INTO public.channel_room_mappings(organization_id, channel, room_type_id)
  VALUES ('a0000000-0000-0000-0000-00000000000a','woobook','f0000000-0000-0000-0000-0000000000a1');
  RAISE EXCEPTION 'FAIL woobook accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS channel id "woobook" rejected';
END $$;
DO $$ BEGIN
  INSERT INTO public.channel_accounts(organization_id, provider) VALUES ('a0000000-0000-0000-0000-00000000000a','wubook');
  RAISE EXCEPTION 'FAIL second account';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS one WuBook account per organization';
END $$;

-- users have no auth.users row; audit FK would reject them (rolled back anyway)
ALTER TABLE public.reservations DISABLE TRIGGER audit_trg;
ALTER TABLE public.channel_property_mappings DISABLE TRIGGER audit_trg;
ALTER TABLE public.cleaning_tasks DISABLE TRIGGER audit_trg;
SET LOCAL ROLE authenticated;

SELECT pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
-- ---------- Guest-count pricing ----------
SELECT pg_temp.eq(public.quote_room_price('e0000000-0000-0000-0000-0000000000a1', current_date+10, current_date+12, 1), 220, 'quote 1 guest uses any-guest date price + base');
SELECT pg_temp.eq(public.quote_room_price('e0000000-0000-0000-0000-0000000000a1', current_date+10, current_date+12, 2), 250, 'quote 2 guests uses guest-specific date price');
DO $$ BEGIN
  PERFORM public.quote_room_price('e0000000-0000-0000-0000-0000000000a1', current_date+10, current_date+12, 3);
  RAISE EXCEPTION 'FAIL quote above room type capacity';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS quote rejects guests above room type capacity (type 2 overrides room 4)';
END $$;
DO $$ BEGIN
  PERFORM public.quote_room_price('e0000000-0000-0000-0000-0000000000a1', current_date+10, current_date+12, 0);
  RAISE EXCEPTION 'FAIL quote with 0 guests';
EXCEPTION WHEN raise_exception THEN RAISE NOTICE 'PASS quote rejects 0 guests';
END $$;
INSERT INTO public.channel_property_mappings(organization_id, account_id, property_id, external_property_code) VALUES
 ('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','WB-1001'),
 ('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a2','WB-1002');
SELECT pg_temp.eq((SELECT count(*) FROM public.channel_property_mappings), 2, 'A maps two properties to two WuBook codes under one account');
DO $$ BEGIN
  INSERT INTO public.channel_property_mappings(organization_id, account_id, property_id, external_property_code)
  VALUES ('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','WB-9999');
  RAISE EXCEPTION 'FAIL property mapped twice';
EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS property maps to one WuBook code per account';
END $$;
DO $$ BEGIN
  INSERT INTO public.channel_property_mappings(organization_id, account_id, property_id, external_property_code)
  VALUES ('a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000b1','WB-2001');
  RAISE EXCEPTION 'FAIL A mapped B property';
EXCEPTION WHEN check_violation OR insufficient_privilege THEN RAISE NOTICE 'PASS A cannot map a B property';
END $$;
DO $$ BEGIN
  INSERT INTO public.channel_property_mappings(organization_id, account_id, property_id, external_property_code)
  VALUES ('b0000000-0000-0000-0000-00000000000b','b1000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','WB-2001');
  RAISE EXCEPTION 'FAIL A wrote into B';
EXCEPTION WHEN check_violation OR insufficient_privilege THEN RAISE NOTICE 'PASS A cannot write B mappings';
END $$;

-- ---------- Price audit ----------
INSERT INTO public.reservations(id, organization_id, room_id, property_id, guest_name, guests_count, check_in, check_out, channel, revenue)
VALUES ('9a000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-0000000000a1','G1', 2, current_date+10, current_date+12, 'phone', 250);
SELECT pg_temp.eq((SELECT list_price FROM public.reservations WHERE id='9a000000-0000-0000-0000-000000000001'), 250, 'list price computed server-side for 2 guests');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations WHERE id='9a000000-0000-0000-0000-000000000001' AND price_overridden_by IS NULL), 1, 'no override when price equals list price');
DO $$ BEGIN
  UPDATE public.reservations SET revenue = 200 WHERE id='9a000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'FAIL manual price without reason';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS manual price without reason rejected';
END $$;
UPDATE public.reservations SET revenue = 200, discount_reason = 'Stammgast' WHERE id='9a000000-0000-0000-0000-000000000001';
SELECT pg_temp.eq((SELECT discount_amount FROM public.reservations WHERE id='9a000000-0000-0000-0000-000000000001'), 50, 'discount amount recorded');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations WHERE id='9a000000-0000-0000-0000-000000000001'
  AND price_overridden_by='aaaaaaaa-0000-0000-0000-000000000001' AND price_overridden_at IS NOT NULL), 1, 'override author and time recorded');
DO $$ BEGIN
  UPDATE public.reservations SET guests_count = 3 WHERE id='9a000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'FAIL update above capacity';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS update above capacity rejected';
END $$;
DO $$ BEGIN
  INSERT INTO public.reservations(organization_id, room_id, property_id, guest_name, guests_count, check_in, check_out, channel, revenue)
  VALUES ('a0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-0000000000a1','G2', 1, current_date+20, current_date+21, 'phone', 10);
  RAISE EXCEPTION 'FAIL insert with discount but no reason';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS new booking with lower price needs a reason';
END $$;

-- ---------- Tenant B cannot see A ----------
SELECT pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
SELECT pg_temp.eq((SELECT count(*) FROM public.channel_property_mappings WHERE organization_id='a0000000-0000-0000-0000-00000000000a'), 0, 'B cannot read A WuBook mappings');
SELECT pg_temp.eq((SELECT count(*) FROM public.occupancy_rates WHERE organization_id='a0000000-0000-0000-0000-00000000000a'), 0, 'B cannot read A occupancy prices');
SELECT pg_temp.eq((SELECT count(*) FROM public.reservations WHERE organization_id='a0000000-0000-0000-0000-00000000000a'), 0, 'B cannot read A priced reservations');
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE organization_id='a0000000-0000-0000-0000-00000000000a'), 0, 'B cannot read A outbox');

RESET ROLE;
-- ---------- Outbox: price change creates an event (checked as privileged role) ----------
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE event='reservation_price'
  AND payload->>'reservation_id'='9a000000-0000-0000-0000-000000000001' AND (payload->>'revenue')::numeric = 200
  AND property_id='d0000000-0000-0000-0000-0000000000a1'), 1, 'price change enqueues property-scoped outbox event');
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE payload ? 'guest_name'), 0, 'outbox never carries guest names');

-- ---------- Clock-in location override is audited and needs a reason ----------
DO $$ BEGIN
  UPDATE public.properties SET clock_without_location = true WHERE id='d0000000-0000-0000-0000-0000000000a1';
  RAISE EXCEPTION 'FAIL override without reason';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS clock-without-location override needs a reason';
END $$;

ROLLBACK;
