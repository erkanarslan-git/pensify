ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'Zahlbar sofort nach Erhalt der Rechnung ohne Abzug.';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS payment_due_days integer NOT NULL DEFAULT 0 CHECK (payment_due_days BETWEEN 0 AND 365);
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS next_customer_number integer NOT NULL DEFAULT 10001 CHECK (next_customer_number >= 1);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS customer_number text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date date;

CREATE TABLE public.invoice_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  match_key text NOT NULL,
  customer_number text NOT NULL,
  name text NOT NULL,
  address text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, match_key),
  UNIQUE (organization_id, customer_number)
);
GRANT SELECT ON public.invoice_customers TO authenticated;
GRANT ALL ON public.invoice_customers TO service_role;
ALTER TABLE public.invoice_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance reads invoice customers" ON public.invoice_customers FOR SELECT TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_permission(organization_id,'view_finance'));

CREATE TABLE public.invoice_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  article_no text NOT NULL CHECK (length(trim(article_no)) BETWEEN 1 AND 30),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  unit text NOT NULL DEFAULT 'Stk.' CHECK (length(unit) <= 20),
  unit_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  vat_rate numeric(5,2) NOT NULL DEFAULT 19 CHECK (vat_rate BETWEEN 0 AND 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, article_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_articles TO authenticated;
GRANT ALL ON public.invoice_articles TO service_role;
ALTER TABLE public.invoice_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance reads invoice articles" ON public.invoice_articles FOR SELECT TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_permission(organization_id,'view_finance'));
CREATE POLICY "admins insert invoice articles" ON public.invoice_articles FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY "admins update invoice articles" ON public.invoice_articles FOR UPDATE TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]))
  WITH CHECK (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY "admins delete invoice articles" ON public.invoice_articles FOR DELETE TO authenticated
  USING (organization_id = public.active_organization_id() AND public.has_organization_role(organization_id, ARRAY['owner','admin']::org_role[]));

CREATE OR REPLACE FUNCTION public.create_invoice_v2(_reservation uuid, _number text, _issue_date date, _recipient_name text, _recipient_address text, _recipient_email text, _items jsonb, _note text DEFAULT NULL, _prices_net boolean DEFAULT false, _payment_method text DEFAULT NULL, _payment_terms text DEFAULT NULL, _due_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; s public.invoice_settings; yr int; auto_no text; final_no text; it jsonb; q numeric; p numeric; v numeric; line numeric; lv numeric; gross numeric := 0; vat numeric := 0; clean jsonb := '[]'::jsonb; new_id uuid; pos int := 0; mkey text; cno text; idate date;
BEGIN
  SELECT id, organization_id, property_id, booking_number INTO r FROM public.reservations WHERE id = _reservation AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.can_finance_action(r.organization_id, r.property_id, 'collect_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_recipient_name),'') = '' THEN RAISE EXCEPTION 'recipient required'; END IF;
  IF _payment_method IS NOT NULL AND _payment_method NOT IN ('cash','card','transfer','invoice','online') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN RAISE EXCEPTION 'items required'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    q := (it->>'quantity')::numeric; p := (it->>'unit_price')::numeric; v := (it->>'vat_rate')::numeric;
    IF coalesce(trim(it->>'description'),'') = '' OR q IS NULL OR q <= 0 OR p IS NULL OR v IS NULL OR v < 0 OR v > 100 THEN RAISE EXCEPTION 'invalid item'; END IF;
    line := round(q * p, 2); pos := pos + 1;
    IF _prices_net THEN lv := round(line * v / 100, 2); gross := gross + line + lv; vat := vat + lv;
    ELSE gross := gross + line; vat := vat + round(line - line / (1 + v/100), 2); END IF;
    clean := clean || jsonb_build_object('pos', pos, 'article_no', left(coalesce(trim(it->>'article_no'),''),30), 'description', left(trim(it->>'description'),1000), 'quantity', q, 'unit', left(coalesce(it->>'unit',''),20), 'unit_price', round(p,2), 'vat_rate', v, 'total', line);
  END LOOP;
  INSERT INTO public.invoice_settings(organization_id) VALUES (r.organization_id) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.invoice_settings WHERE organization_id = r.organization_id FOR UPDATE;
  idate := coalesce(_issue_date, (now() AT TIME ZONE 'Europe/Berlin')::date);
  yr := extract(year FROM idate)::int;
  IF s.number_year IS DISTINCT FROM yr AND s.number_year IS NOT NULL AND s.number_format LIKE '%{YY%' THEN s.next_number := 1; END IF;
  auto_no := public.format_invoice_number(s.number_format, yr, s.next_number);
  final_no := coalesce(nullif(trim(_number),''), auto_no);
  IF EXISTS (SELECT 1 FROM public.invoices WHERE organization_id = r.organization_id AND invoice_number = final_no) THEN RAISE EXCEPTION 'invoice number exists' USING ERRCODE='23505'; END IF;
  -- Stable customer number per recipient (email if given, else name)
  mkey := lower(coalesce(nullif(trim(_recipient_email),''), regexp_replace(trim(_recipient_name), '\s+', ' ', 'g')));
  SELECT customer_number INTO cno FROM public.invoice_customers WHERE organization_id = r.organization_id AND match_key = mkey;
  IF cno IS NULL THEN
    cno := s.next_customer_number::text;
    INSERT INTO public.invoice_customers(organization_id, match_key, customer_number, name, address, email)
      VALUES (r.organization_id, mkey, cno, trim(_recipient_name), nullif(trim(_recipient_address),''), nullif(trim(_recipient_email),''));
    UPDATE public.invoice_settings SET next_customer_number = s.next_customer_number + 1 WHERE organization_id = r.organization_id;
  ELSE
    UPDATE public.invoice_customers SET name = trim(_recipient_name), address = coalesce(nullif(trim(_recipient_address),''), address) WHERE organization_id = r.organization_id AND match_key = mkey;
  END IF;
  INSERT INTO public.invoices(organization_id, property_id, reservation_id, booking_number, invoice_number, issue_date, recipient_name, recipient_address, recipient_email, items, net_total, vat_total, gross_total, prices_net, issuer, note, created_by, customer_number, payment_method, payment_terms, due_date)
  VALUES (r.organization_id, r.property_id, r.id, r.booking_number, final_no, idate, trim(_recipient_name), nullif(trim(_recipient_address),''), nullif(trim(_recipient_email),''), clean, gross - vat, vat, gross, _prices_net,
    jsonb_build_object('company_name', s.company_name, 'address', s.address, 'tax_number', s.tax_number, 'vat_id', s.vat_id, 'email', s.email, 'phone', s.phone, 'bank_name', s.bank_name, 'iban', s.iban, 'bic', s.bic, 'footer_note', s.footer_note),
    nullif(trim(_note),''), auth.uid(), cno, _payment_method, left(coalesce(nullif(trim(_payment_terms),''), s.payment_terms), 500), coalesce(_due_date, idate + s.payment_due_days))
  RETURNING id INTO new_id;
  IF final_no = auto_no THEN UPDATE public.invoice_settings SET next_number = s.next_number + 1, number_year = yr WHERE organization_id = r.organization_id; END IF;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.create_invoice_v2(uuid,text,date,text,text,text,jsonb,text,boolean,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_v2(uuid,text,date,text,text,text,jsonb,text,boolean,text,text,date) TO authenticated;
COMMENT ON FUNCTION public.create_invoice(uuid,text,date,text,text,text,jsonb,text,boolean) IS 'DEPRECATED: replaced by create_invoice_v2';