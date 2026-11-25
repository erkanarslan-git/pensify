CREATE SEQUENCE IF NOT EXISTS public.reservation_booking_number_seq START 10001;
GRANT USAGE ON SEQUENCE public.reservation_booking_number_seq TO authenticated, service_role;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS booking_number bigint NOT NULL DEFAULT nextval('public.reservation_booking_number_seq');
CREATE UNIQUE INDEX IF NOT EXISTS reservations_booking_number_uidx ON public.reservations(organization_id, booking_number);

CREATE TABLE public.reservation_payment_status (
  reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('paid','partial','open')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservation_payment_status_state_idx ON public.reservation_payment_status(organization_id, state);
GRANT SELECT ON public.reservation_payment_status TO authenticated;
GRANT ALL ON public.reservation_payment_status TO service_role;
ALTER TABLE public.reservation_payment_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "property members read payment status" ON public.reservation_payment_status FOR SELECT TO authenticated
  USING (organization_id = public.active_organization_id() AND public.can_access_property(property_id));

CREATE OR REPLACE FUNCTION public.refresh_reservation_payment_status(_rid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total numeric; paid numeric; st text; r record;
BEGIN
  SELECT id, organization_id, property_id INTO r FROM public.reservations WHERE id = _rid;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT coalesce(sum(amount),0) INTO total FROM public.payment_schedules WHERE reservation_id = _rid AND kind = 'rent';
  SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE reservation_id = _rid AND reversed_at IS NULL AND kind <> 'deposit';
  st := CASE WHEN total > 0 AND paid >= total - 0.005 THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'open' END;
  INSERT INTO public.reservation_payment_status(reservation_id, organization_id, property_id, state, updated_at)
  VALUES (r.id, r.organization_id, r.property_id, st, now())
  ON CONFLICT (reservation_id) DO UPDATE SET state = excluded.state, property_id = excluded.property_id, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.refresh_reservation_payment_status(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_refresh_payment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'reservations' THEN
    PERFORM public.refresh_reservation_payment_status(NEW.id);
    RETURN NEW;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.reservation_id IS NOT NULL THEN PERFORM public.refresh_reservation_payment_status(OLD.reservation_id); END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.reservation_id IS NOT NULL THEN PERFORM public.refresh_reservation_payment_status(NEW.reservation_id); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER payments_refresh_payment_status AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_payment_status();
CREATE TRIGGER schedules_refresh_payment_status AFTER INSERT OR UPDATE OR DELETE ON public.payment_schedules FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_payment_status();
CREATE TRIGGER reservations_init_payment_status AFTER INSERT OR UPDATE OF property_id ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_payment_status();

INSERT INTO public.reservation_payment_status(reservation_id, organization_id, property_id, state)
SELECT r.id, r.organization_id, r.property_id,
  CASE WHEN coalesce(s.total,0) > 0 AND coalesce(p.paid,0) >= s.total - 0.005 THEN 'paid' WHEN coalesce(p.paid,0) > 0 THEN 'partial' ELSE 'open' END
FROM public.reservations r
LEFT JOIN (SELECT reservation_id, sum(amount) total FROM public.payment_schedules WHERE kind='rent' GROUP BY 1) s ON s.reservation_id = r.id
LEFT JOIN (SELECT reservation_id, sum(amount) paid FROM public.payments WHERE reversed_at IS NULL AND kind <> 'deposit' GROUP BY 1) p ON p.reservation_id = r.id
ON CONFLICT DO NOTHING;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS prices_net boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS booking_number bigint;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cancelled_by uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cancel_reason text;

DROP FUNCTION IF EXISTS public.create_invoice(uuid,text,date,text,text,text,jsonb,text);
CREATE OR REPLACE FUNCTION public.create_invoice(_reservation uuid, _number text, _issue_date date, _recipient_name text, _recipient_address text, _recipient_email text, _items jsonb, _note text DEFAULT NULL, _prices_net boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; s public.invoice_settings; yr int; auto_no text; final_no text; it jsonb; q numeric; p numeric; v numeric; line numeric; lv numeric; gross numeric := 0; vat numeric := 0; clean jsonb := '[]'::jsonb; new_id uuid;
BEGIN
  SELECT id, organization_id, property_id, booking_number INTO r FROM public.reservations WHERE id = _reservation AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.can_finance_action(r.organization_id, r.property_id, 'collect_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_recipient_name),'') = '' THEN RAISE EXCEPTION 'recipient required'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN RAISE EXCEPTION 'items required'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    q := (it->>'quantity')::numeric; p := (it->>'unit_price')::numeric; v := (it->>'vat_rate')::numeric;
    IF coalesce(trim(it->>'description'),'') = '' OR q IS NULL OR q <= 0 OR p IS NULL OR v IS NULL OR v < 0 OR v > 100 THEN RAISE EXCEPTION 'invalid item'; END IF;
    line := round(q * p, 2);
    IF _prices_net THEN
      lv := round(line * v / 100, 2);
      gross := gross + line + lv; vat := vat + lv;
    ELSE
      gross := gross + line; vat := vat + round(line - line / (1 + v/100), 2);
    END IF;
    clean := clean || jsonb_build_object('description', left(trim(it->>'description'),1000), 'quantity', q, 'unit', left(coalesce(it->>'unit',''),20), 'unit_price', round(p,2), 'vat_rate', v, 'total', line);
  END LOOP;
  INSERT INTO public.invoice_settings(organization_id) VALUES (r.organization_id) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.invoice_settings WHERE organization_id = r.organization_id FOR UPDATE;
  yr := extract(year FROM coalesce(_issue_date, (now() AT TIME ZONE 'Europe/Berlin')::date))::int;
  IF s.number_year IS DISTINCT FROM yr AND s.number_year IS NOT NULL AND s.number_format LIKE '%{YY%' THEN s.next_number := 1; END IF;
  auto_no := public.format_invoice_number(s.number_format, yr, s.next_number);
  final_no := coalesce(nullif(trim(_number),''), auto_no);
  IF EXISTS (SELECT 1 FROM public.invoices WHERE organization_id = r.organization_id AND invoice_number = final_no) THEN RAISE EXCEPTION 'invoice number exists' USING ERRCODE='23505'; END IF;
  INSERT INTO public.invoices(organization_id, property_id, reservation_id, booking_number, invoice_number, issue_date, recipient_name, recipient_address, recipient_email, items, net_total, vat_total, gross_total, prices_net, issuer, note, created_by)
  VALUES (r.organization_id, r.property_id, r.id, r.booking_number, final_no, coalesce(_issue_date, (now() AT TIME ZONE 'Europe/Berlin')::date), trim(_recipient_name), nullif(trim(_recipient_address),''), nullif(trim(_recipient_email),''), clean, gross - vat, vat, gross, _prices_net,
    jsonb_build_object('company_name', s.company_name, 'address', s.address, 'tax_number', s.tax_number, 'vat_id', s.vat_id, 'email', s.email, 'phone', s.phone, 'bank_name', s.bank_name, 'iban', s.iban, 'bic', s.bic, 'footer_note', s.footer_note),
    nullif(trim(_note),''), auth.uid())
  RETURNING id INTO new_id;
  IF final_no = auto_no THEN
    UPDATE public.invoice_settings SET next_number = s.next_number + 1, number_year = yr WHERE organization_id = r.organization_id;
  END IF;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.create_invoice(uuid,text,date,text,text,text,jsonb,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid,text,date,text,text,text,jsonb,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_invoice(_invoice uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record;
BEGIN
  SELECT organization_id, cancelled_at INTO i FROM public.invoices WHERE id = _invoice;
  IF NOT FOUND OR NOT public.has_organization_role(i.organization_id, ARRAY['owner','admin']::org_role[]) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF i.cancelled_at IS NOT NULL THEN RETURN; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE public.invoices SET cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = left(trim(_reason),500) WHERE id = _invoice;
END $$;
REVOKE ALL ON FUNCTION public.cancel_invoice(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) TO authenticated;