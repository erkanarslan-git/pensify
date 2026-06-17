
-- 1) Restrict reservations SELECT to owner/admin/manager (no cleaner access to guest PII)
DROP POLICY IF EXISTS "reservations_read" ON public.reservations;
CREATE POLICY "reservations_read" ON public.reservations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
  );

-- 2) Restrict cleaner self-update on time_entries to operational fields only
DROP POLICY IF EXISTS "time_entries_self_update" ON public.time_entries;
CREATE POLICY "time_entries_self_update" ON public.time_entries FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid())
  );

-- Trigger guards payment & override columns: cleaners cannot change them
CREATE OR REPLACE FUNCTION public.protect_time_entries_payment_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
     OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
     OR NEW.manual_override_at IS DISTINCT FROM OLD.manual_override_at
     OR NEW.manual_override_by IS DISTINCT FROM OLD.manual_override_by
     OR NEW.cleaner_id IS DISTINCT FROM OLD.cleaner_id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.hourly_rate_snapshot IS DISTINCT FROM OLD.hourly_rate_snapshot
  THEN
    RAISE EXCEPTION 'cleaners cannot modify payment or admin fields';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.protect_time_entries_payment_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_entries_protect_payment ON public.time_entries;
CREATE TRIGGER time_entries_protect_payment
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_time_entries_payment_fields();
