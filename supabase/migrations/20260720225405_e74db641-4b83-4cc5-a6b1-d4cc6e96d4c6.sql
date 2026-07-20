
CREATE OR REPLACE FUNCTION public.enforce_past_reservation_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_priv boolean;
  v_uid uuid := auth.uid();
BEGIN
  -- Server-side (no user context, e.g. migrations, cron, service_role): allow
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only owner/admin can touch past-dated reservations
  v_priv := public.has_role(v_uid,'owner') OR public.has_role(v_uid,'admin');
  IF v_priv THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.check_out <= v_today THEN
      RAISE EXCEPTION 'Vergangene Buchungen dürfen nur von Admin/Inhaber angelegt werden.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Locked once stay has ended (check_out already passed)
    IF OLD.check_out <= v_today OR NEW.check_out <= v_today THEN
      RAISE EXCEPTION 'Diese Buchung ist abgelaufen und kann nur von Admin/Inhaber bearbeitet werden.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.check_out <= v_today THEN
      RAISE EXCEPTION 'Abgelaufene Buchungen dürfen nur von Admin/Inhaber gelöscht werden.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
