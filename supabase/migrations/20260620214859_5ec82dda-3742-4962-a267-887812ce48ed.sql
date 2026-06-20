
CREATE OR REPLACE FUNCTION public.protect_time_entries_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owners and admins can change any field
  IF public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;

  -- Non-admins (cleaners): block payment/admin field changes
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
     OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
     OR NEW.payment_period_start IS DISTINCT FROM OLD.payment_period_start
     OR NEW.payment_period_end IS DISTINCT FROM OLD.payment_period_end
     OR NEW.manual_override_at IS DISTINCT FROM OLD.manual_override_at
     OR NEW.manual_override_by IS DISTINCT FROM OLD.manual_override_by
     OR NEW.cleaner_id IS DISTINCT FROM OLD.cleaner_id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.clock_in_at IS DISTINCT FROM OLD.clock_in_at
  THEN
    RAISE EXCEPTION 'Cleaners cannot modify payment or admin fields'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;
