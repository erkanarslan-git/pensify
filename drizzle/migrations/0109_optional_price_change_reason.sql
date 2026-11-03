CREATE OR REPLACE FUNCTION public.reservation_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cap int; v_quote numeric; v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.guests_count IS DISTINCT FROM OLD.guests_count OR NEW.room_id IS DISTINCT FROM OLD.room_id THEN
    v_cap := public.room_capacity(NEW.room_id);
    IF NEW.guests_count < 1 OR (v_cap IS NOT NULL AND NEW.guests_count > v_cap) THEN
      RAISE EXCEPTION 'Zu viele Gäste für dieses Zimmer: % (maximal %)', NEW.guests_count, v_cap USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' OR (NEW.room_id, NEW.check_in, NEW.check_out, NEW.guests_count)
       IS DISTINCT FROM (OLD.room_id, OLD.check_in, OLD.check_out, OLD.guests_count) THEN
    v_quote := public.quote_room_price(NEW.room_id, NEW.check_in, NEW.check_out, NEW.guests_count);
    IF v_quote IS NOT NULL THEN NEW.list_price := v_quote; END IF;
  END IF;

  IF NEW.revenue IS NULL OR NEW.revenue < 0 THEN NEW.revenue := 0; END IF;

  v_changed := TG_OP = 'INSERT' OR NEW.revenue IS DISTINCT FROM OLD.revenue OR NEW.list_price IS DISTINCT FROM OLD.list_price;
  IF v_changed THEN
    IF NEW.list_price IS NOT NULL AND NEW.revenue <> NEW.list_price THEN
      -- Free price entry (incl. 0 € when unpaid); reason optional, author/time always recorded.
      NEW.discount_reason := nullif(trim(coalesce(NEW.discount_reason, '')), '');
      NEW.price_overridden_by := auth.uid();
      NEW.price_overridden_at := now();
    ELSE
      NEW.discount_reason := NULL; NEW.price_overridden_by := NULL; NEW.price_overridden_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $function$;