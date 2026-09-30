-- Property-scoped room types / rates / channel mappings. ONE transaction, always ROLLBACK.
BEGIN;
CREATE FUNCTION pg_temp.eq(actual numeric, expected numeric, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual; END IF;
  RAISE NOTICE 'PASS %', label;
END $$;

-- Fixtures: org A with houses A1, A2; org B with house B1
INSERT INTO public.organizations(id, name, slug, timezone, default_currency, locale) VALUES
 ('a0000000-0000-0000-0000-00000000000a','Test A','test-a-prop','Europe/Berlin','EUR','de'),
 ('b0000000-0000-0000-0000-00000000000b','Test B','test-b-prop','Europe/Berlin','EUR','de');
INSERT INTO public.cities(id, organization_id, name, country) VALUES
 ('c0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','CityA','DE'),
 ('c0000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-00000000000b','CityB','DE');
INSERT INTO public.properties(id, organization_id, city_id, name, address) VALUES
 ('d0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','A1','x'),
 ('d0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000a','A2','x'),
 ('d0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','c0000000-0000-0000-0000-00000000000b','B1','x');
INSERT INTO public.channel_accounts(id, organization_id, provider) VALUES
 ('a1000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','wubook');
INSERT INTO public.channel_property_mappings(id, organization_id, account_id, property_id, external_property_code) VALUES
 ('a2000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','WB-A1'),
 ('a2000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a2','WB-A2');

-- 1. Both houses have a "Doppelzimmer" (same code) with their own price and external room id
INSERT INTO public.room_types(id, organization_id, property_id, name, code, capacity) VALUES
 ('f0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a1','Doppelzimmer','DZ',2),
 ('f0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a2','Doppelzimmer','DZ',2),
 ('f0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-0000000000b1','Doppelzimmer','DZ',2);
INSERT INTO public.rate_plans(id, organization_id, room_type_id, name, code, base_price) VALUES
 ('f1000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-0000000000a1','Standard','STD',90),
 ('f1000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-0000000000a2','Standard','STD',120);
SELECT pg_temp.eq((SELECT count(*) FROM public.rate_plans WHERE id='f1000000-0000-0000-0000-0000000000a1' AND property_id='d0000000-0000-0000-0000-0000000000a1'), 1, 'rate plan inherits its house');
INSERT INTO public.channel_room_mappings(organization_id, channel, room_type_id, rate_plan_id, property_mapping_id, external_room_id) VALUES
 ('a0000000-0000-0000-0000-00000000000a','wubook','f0000000-0000-0000-0000-0000000000a1','f1000000-0000-0000-0000-0000000000a1','a2000000-0000-0000-0000-0000000000a1','R-111'),
 ('a0000000-0000-0000-0000-00000000000a','wubook','f0000000-0000-0000-0000-0000000000a2','f1000000-0000-0000-0000-0000000000a2','a2000000-0000-0000-0000-0000000000a2','R-222');
SELECT pg_temp.eq((SELECT count(DISTINCT external_room_id) FROM public.channel_room_mappings WHERE organization_id='a0000000-0000-0000-0000-00000000000a'), 2, 'two houses map Doppelzimmer to different external room ids');

-- 2. Price change for house A1 creates an event for A1 only
DELETE FROM public.integration_outbox WHERE organization_id='a0000000-0000-0000-0000-00000000000a';
UPDATE public.rate_plans SET base_price = 95 WHERE id='f1000000-0000-0000-0000-0000000000a1';
INSERT INTO public.occupancy_rates(organization_id, rate_plan_id, date, guest_count, price)
VALUES ('a0000000-0000-0000-0000-00000000000a','f1000000-0000-0000-0000-0000000000a1', current_date+5, 2, 110);
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE organization_id='a0000000-0000-0000-0000-00000000000a' AND property_id='d0000000-0000-0000-0000-0000000000a1' AND event='rates'), 2, 'A1 price changes create A1 events');
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE property_id='d0000000-0000-0000-0000-0000000000a2'), 0, 'A1 price change creates nothing for A2');
UPDATE public.occupancy_rates SET closed = true WHERE rate_plan_id='f1000000-0000-0000-0000-0000000000a1';
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE property_id='d0000000-0000-0000-0000-0000000000a1' AND event='restrictions'), 1, 'closing a date is a restrictions event for A1');
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE organization_id='a0000000-0000-0000-0000-00000000000a' AND property_id IS NULL), 0, 'no event without house');

-- 3. Cross-property and cross-tenant rejections
DO $$ BEGIN
  INSERT INTO public.rooms(organization_id, property_id, number, room_type_id)
  VALUES ('a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000a2','9','f0000000-0000-0000-0000-0000000000a1');
  RAISE EXCEPTION 'FAIL room used other house room type';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS room cannot use another house''s room type';
END $$;
DO $$ BEGIN
  INSERT INTO public.channel_room_mappings(organization_id, channel, room_type_id, property_mapping_id, external_room_id)
  VALUES ('a0000000-0000-0000-0000-00000000000a','booking_com','f0000000-0000-0000-0000-0000000000a1','a2000000-0000-0000-0000-0000000000a2','R-X');
  RAISE EXCEPTION 'FAIL mapping linked A1 type to A2 WuBook property';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS cross-property channel mapping rejected';
END $$;
DO $$ BEGIN
  INSERT INTO public.channel_room_mappings(organization_id, channel, room_type_id, rate_plan_id)
  VALUES ('a0000000-0000-0000-0000-00000000000a','airbnb','f0000000-0000-0000-0000-0000000000a1','f1000000-0000-0000-0000-0000000000a2');
  RAISE EXCEPTION 'FAIL mapping used other house rate plan';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS rate plan of another house rejected';
END $$;
DO $$ BEGIN
  INSERT INTO public.channel_room_mappings(organization_id, channel, room_type_id)
  VALUES ('a0000000-0000-0000-0000-00000000000a','expedia','f0000000-0000-0000-0000-0000000000b1');
  RAISE EXCEPTION 'FAIL cross-tenant room type';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS cross-tenant room type rejected';
END $$;
DO $$ BEGIN
  INSERT INTO public.room_types(organization_id, property_id, name, code)
  VALUES ('a0000000-0000-0000-0000-00000000000a','d0000000-0000-0000-0000-0000000000b1','Evil','EV');
  RAISE EXCEPTION 'FAIL room type on other tenant house';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS room type on another tenant''s house rejected';
END $$;
DO $$ BEGIN
  INSERT INTO public.rate_plans(organization_id, room_type_id, name, code, base_price)
  VALUES ('a0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-0000000000b1','Evil','EV',1);
  RAISE EXCEPTION 'FAIL cross-tenant rate plan';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS cross-tenant rate plan rejected';
END $$;

ROLLBACK;
