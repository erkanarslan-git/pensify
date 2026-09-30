-- Regression: deleting a property removes its pending/retry/dry-run outbox rows
-- (ON DELETE CASCADE) without touching another property's rows. ONE transaction, always ROLLBACK.
-- Run as a privileged role that may SET ROLE authenticated. Any failed assertion aborts the run.
BEGIN;

CREATE FUNCTION pg_temp.eq(actual numeric, expected numeric, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual; END IF;
  RAISE NOTICE 'PASS %', label;
END $$;

-- ---------- Fixtures ----------
INSERT INTO public.organizations(id, name, slug, timezone, default_currency, locale) VALUES
 ('a0000000-0000-0000-0000-00000000000c', 'Test C', 'test-c-cascade', 'Europe/Berlin', 'EUR', 'de');
INSERT INTO public.organization_members(organization_id, user_id, role) VALUES
 ('a0000000-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-00000000000c','admin');
INSERT INTO public.cities(id, organization_id, name, country) VALUES
 ('c0000000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-00000000000c','CityC','DE');
INSERT INTO public.properties(id, organization_id, city_id, name, address) VALUES
 ('d0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-00000000000c','c0000000-0000-0000-0000-00000000000c','PC1','x'),
 ('d0000000-0000-0000-0000-0000000000c2','a0000000-0000-0000-0000-00000000000c','c0000000-0000-0000-0000-00000000000c','PC2','x');

-- Outbox rows in every delivery state for property C1, plus one for C2.
INSERT INTO public.integration_outbox(organization_id, property_id, provider, event, payload, status, attempts) VALUES
 ('a0000000-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-0000000000c1','wubook','rates','{}','pending',0),
 ('a0000000-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-0000000000c1','wubook','rates','{}','pending',2),
 ('a0000000-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-0000000000c1','wubook','reservation_price','{}','sent',1),
 ('a0000000-0000-0000-0000-00000000000c','d0000000-0000-0000-0000-0000000000c2','wubook','rates','{}','pending',0);

SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE property_id='d0000000-0000-0000-0000-0000000000c1'), 3, 'fixture: C1 has three outbox rows');

-- ---------- Delete property C1 ----------
DELETE FROM public.properties WHERE id='d0000000-0000-0000-0000-0000000000c1';

SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE property_id='d0000000-0000-0000-0000-0000000000c1'), 0, 'deleting a property removes its pending/retry/sent outbox rows');
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE property_id='d0000000-0000-0000-0000-0000000000c2'), 1, 'other property outbox rows are untouched');
SELECT pg_temp.eq((SELECT count(*) FROM public.integration_outbox WHERE property_id IS NULL), 0, 'no outbox row is left without a property');

ROLLBACK;
