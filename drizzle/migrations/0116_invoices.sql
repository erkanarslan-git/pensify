CREATE TABLE public.invoice_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name text, address text, tax_number text, vat_id text, email text, phone text,
  bank_name text, iban text, bic text, footer_note text,
  vat_rate numeric(5,2) NOT NULL DEFAULT 7 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  number_format text NOT NULL DEFAULT '{YYYY}-{NNNN}' CHECK (length(number_format) BETWEEN 1 AND 60 AND position('{N' in number_format) > 0),
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  number_year integer,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.invoice_settings TO authenticated;
GRANT ALL ON public.invoice_settings TO service_role;
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read invoice settings" ON public.invoice_settings FOR SELECT TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_permission(organization_id,'view_finance'));
CREATE POLICY "admins insert invoice settings" ON public.invoice_settings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY "admins update invoice settings" ON public.invoice_settings FOR UPDATE TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]))
  WITH CHECK (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id),
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  issue_date date NOT NULL,
  recipient_name text NOT NULL,
  recipient_address text,
  recipient_email text,
  items jsonb NOT NULL,
  net_total numeric(12,2) NOT NULL,
  vat_total numeric(12,2) NOT NULL,
  gross_total numeric(12,2) NOT NULL,
  issuer jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);
CREATE INDEX invoices_reservation_idx ON public.invoices(reservation_id);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance reads invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.can_manage_payments(organization_id, property_id));

CREATE OR REPLACE FUNCTION public.format_invoice_number(_format text, _year integer, _n integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT replace(replace(replace(replace(replace(_format,'{YYYY}',_year::text),'{YY}',lpad((_year % 100)::text,2,'0')),'{NNNNN}',lpad(_n::text,5,'0')),'{NNNN}',lpad(_n::text,4,'0')),'{NNN}',lpad(_n::text,3,'0'))
$$;

CREATE OR REPLACE FUNCTION public.create_invoice(_reservation uuid, _number text, _issue_date date, _recipient_name text, _recipient_address text, _recipient_email text, _items jsonb, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; s public.invoice_settings; yr int; auto_no text; final_no text; it jsonb; q numeric; p numeric; v numeric; line numeric; gross numeric := 0; vat numeric := 0; clean jsonb := '[]'::jsonb; new_id uuid;
BEGIN
  SELECT id, organization_id, property_id INTO r FROM public.reservations WHERE id = _reservation AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.can_finance_action(r.organization_id, r.property_id, 'collect_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_recipient_name),'') = '' THEN RAISE EXCEPTION 'recipient required'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN RAISE EXCEPTION 'items required'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    q := (it->>'quantity')::numeric; p := (it->>'unit_price')::numeric; v := (it->>'vat_rate')::numeric;
    IF coalesce(trim(it->>'description'),'') = '' OR q IS NULL OR q <= 0 OR p IS NULL OR v IS NULL OR v < 0 OR v > 100 THEN RAISE EXCEPTION 'invalid item'; END IF;
    line := round(q * p, 2);
    gross := gross + line;
    vat := vat + round(line - line / (1 + v/100), 2);
    clean := clean || jsonb_build_object('description', left(trim(it->>'description'),300), 'quantity', q, 'unit_price', round(p,2), 'vat_rate', v, 'total', line);
  END LOOP;
  INSERT INTO public.invoice_settings(organization_id) VALUES (r.organization_id) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.invoice_settings WHERE organization_id = r.organization_id FOR UPDATE;
  yr := extract(year FROM coalesce(_issue_date, (now() AT TIME ZONE 'Europe/Berlin')::date))::int;
  IF s.number_year IS DISTINCT FROM yr AND s.number_year IS NOT NULL AND s.number_format LIKE '%{YY%' THEN s.next_number := 1; END IF;
  auto_no := public.format_invoice_number(s.number_format, yr, s.next_number);
  final_no := coalesce(nullif(trim(_number),''), auto_no);
  IF EXISTS (SELECT 1 FROM public.invoices WHERE organization_id = r.organization_id AND invoice_number = final_no) THEN RAISE EXCEPTION 'invoice number exists' USING ERRCODE='23505'; END IF;
  INSERT INTO public.invoices(organization_id, property_id, reservation_id, invoice_number, issue_date, recipient_name, recipient_address, recipient_email, items, net_total, vat_total, gross_total, issuer, note, created_by)
  VALUES (r.organization_id, r.property_id, r.id, final_no, coalesce(_issue_date, (now() AT TIME ZONE 'Europe/Berlin')::date), trim(_recipient_name), nullif(trim(_recipient_address),''), nullif(trim(_recipient_email),''), clean, gross - vat, vat, gross,
    jsonb_build_object('company_name', s.company_name, 'address', s.address, 'tax_number', s.tax_number, 'vat_id', s.vat_id, 'email', s.email, 'phone', s.phone, 'bank_name', s.bank_name, 'iban', s.iban, 'bic', s.bic, 'footer_note', s.footer_note),
    nullif(trim(_note),''), auth.uid())
  RETURNING id INTO new_id;
  IF final_no = auto_no THEN
    UPDATE public.invoice_settings SET next_number = s.next_number + 1, number_year = yr WHERE organization_id = r.organization_id;
  END IF;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.create_invoice(uuid,text,date,text,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid,text,date,text,text,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_invoice_sent(_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record;
BEGIN
  SELECT organization_id, property_id INTO i FROM public.invoices WHERE id = _invoice;
  IF NOT FOUND OR NOT public.can_finance_action(i.organization_id, i.property_id, 'collect_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.invoices SET sent_at = now() WHERE id = _invoice;
END $$;
REVOKE ALL ON FUNCTION public.mark_invoice_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_invoice_sent(uuid) TO authenticated;