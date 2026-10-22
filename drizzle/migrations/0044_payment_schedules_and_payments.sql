CREATE TABLE public.payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_schedules_org_due_idx ON public.payment_schedules(organization_id, due_date);
CREATE INDEX payment_schedules_res_idx ON public.payment_schedules(reservation_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.payment_schedules(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','transfer','card','other')),
  note text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_schedule_idx ON public.payments(schedule_id);
CREATE INDEX payments_res_idx ON public.payments(reservation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedules TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payment_schedules TO service_role;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_payments(_org uuid, _property uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_organization_role(_org, ARRAY['owner','admin','operations_manager','property_manager','reception']::org_role[])
     AND public.can_access_property(_property)
$$;

CREATE OR REPLACE FUNCTION public.payment_rows_before_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT organization_id, property_id INTO r FROM public.reservations WHERE id = NEW.reservation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  NEW.organization_id := r.organization_id;
  NEW.property_id := r.property_id;
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'payment_schedules' THEN NEW.created_by := auth.uid();
    ELSE
      NEW.recorded_by := auth.uid();
      IF NEW.schedule_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payment_schedules s WHERE s.id = NEW.schedule_id AND s.reservation_id = NEW.reservation_id) THEN
        RAISE EXCEPTION 'schedule does not belong to reservation';
      END IF;
    END IF;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_schedules_before_write BEFORE INSERT OR UPDATE ON public.payment_schedules FOR EACH ROW EXECUTE FUNCTION public.payment_rows_before_write();
CREATE TRIGGER payments_before_write BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_rows_before_write();

CREATE OR REPLACE FUNCTION public.payment_schedules_block_paid_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.schedule_id = OLD.id) THEN
    RAISE EXCEPTION 'installment has payments';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER payment_schedules_block_paid_delete BEFORE DELETE ON public.payment_schedules FOR EACH ROW EXECUTE FUNCTION public.payment_schedules_block_paid_delete();

CREATE POLICY "staff read schedules" ON public.payment_schedules FOR SELECT TO authenticated USING (public.can_manage_payments(organization_id, property_id));
CREATE POLICY "staff write schedules" ON public.payment_schedules FOR INSERT TO authenticated WITH CHECK (public.can_manage_payments(organization_id, property_id));
CREATE POLICY "staff update schedules" ON public.payment_schedules FOR UPDATE TO authenticated USING (public.can_manage_payments(organization_id, property_id)) WITH CHECK (public.can_manage_payments(organization_id, property_id));
CREATE POLICY "staff delete schedules" ON public.payment_schedules FOR DELETE TO authenticated USING (public.can_manage_payments(organization_id, property_id));
CREATE POLICY "staff read payments" ON public.payments FOR SELECT TO authenticated USING (public.can_manage_payments(organization_id, property_id));
CREATE POLICY "staff record payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (public.can_manage_payments(organization_id, property_id));
CREATE POLICY "admins delete payments" ON public.payments FOR DELETE TO authenticated USING (public.is_org_admin(organization_id) AND public.can_access_property(property_id));

SELECT public.attach_audit('public.payment_schedules'::regclass);
SELECT public.attach_audit('public.payments'::regclass);