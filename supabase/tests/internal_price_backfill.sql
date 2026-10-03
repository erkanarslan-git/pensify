-- Regression: a controlled internal price backfill can suppress OTA outbox rows.
-- Run in a privileged test environment. This transaction always rolls back.
BEGIN;

CREATE FUNCTION pg_temp.eq(actual numeric, expected numeric, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual; END IF;
  RAISE NOTICE 'PASS %', label;
END $$;

INSERT INTO public.organizations(id, name, slug, timezone, default_currency, locale) VALUES
 ('a0000000-0000-0000-0000-000000000022', 'Backfill test', 'backfill-test-0022', 'Europe/Berlin', 'EUR', 'de');
INSERT INTO public.cities(id, organization_id, name, country) VALUES
 ('c0000000-0000-0000-0000-000000000022','a0000000-0000-0000-0000-000000000022','Teststadt','DE');
INSERT INTO public.properties(id, organization_id, city_id, name, address) VALUES
 ('d0000000-0000-0000-0000-000000000022','a0000000-0000-0000-0000-000000000022','c0000000-0000-0000-0000-000000000022','Testhaus','Testweg 1');
INSERT INTO public.room_types(id, organization_id, property_id, name, code, capacity, base_occupancy) VALUES
 ('e0000000-0000-0000-0000-000000000022','a0000000-0000-0000-0000-000000000022','d0000000-0000-0000-0000-000000000022','Einzelzimmer','EZ',1,1);

SELECT set_config('app.skip_channel_outbox', 'on', true);
INSERT INTO public.rate_plans(organization_id, property_id, room_type_id, name, code, currency, base_price, min_stay, active)
VALUES ('a0000000-0000-0000-0000-000000000022','d0000000-0000-0000-0000-000000000022','e0000000-0000-0000-0000-000000000022','Standard (Demo)','EZ-STD','EUR',49,1,true);

SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE property_id='d0000000-0000-0000-0000-000000000022'), 0,
  'internal demo price creates no channel outbox row');

ROLLBACK;