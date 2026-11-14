ALTER TABLE public.reservations ADD COLUMN long_stay boolean NOT NULL DEFAULT false;
CREATE INDEX reservations_long_stay_idx ON public.reservations(organization_id, check_out) WHERE long_stay AND deleted_at IS NULL;

-- Keeps open-ended stays occupied: departure is always pushed at least 30 days ahead (Berlin date), logged as an extension.
CREATE OR REPLACE FUNCTION public.extend_long_stays()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  _target date := _today + 60;
  _r record; _n integer := 0;
BEGIN
  FOR _r IN
    SELECT id, organization_id, check_out FROM public.reservations
    WHERE long_stay AND deleted_at IS NULL AND status IN ('confirmed','tentative','checked_in')
      AND check_out < _today + 30
    ORDER BY organization_id, id
  LOOP
    BEGIN
      UPDATE public.reservations SET check_out = _target WHERE id = _r.id;
      INSERT INTO public.reservation_extensions(organization_id, reservation_id, old_check_out, new_check_out, days, note, created_by)
        VALUES (_r.organization_id, _r.id, _r.check_out, _target, _target - _r.check_out, 'Dauergast', NULL);
      _n := _n + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'long stay % not extended: %', _r.id, SQLERRM;
    END;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.extend_long_stays() FROM public, anon, authenticated;
SELECT cron.schedule('extend-long-stays', '23 2 * * *', $c$SELECT public.extend_long_stays()$c$);