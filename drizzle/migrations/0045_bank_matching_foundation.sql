-- Payment references, deposit kind, payer IBANs, reversible payments
ALTER TABLE public.payment_schedules ADD COLUMN IF NOT EXISTS payment_reference text NOT NULL DEFAULT ('PH-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)));
ALTER TABLE public.payment_schedules ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'rent' CHECK (kind IN ('rent','deposit','other'));
ALTER TABLE public.payment_schedules ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';
CREATE UNIQUE INDEX IF NOT EXISTS payment_schedules_org_ref_uidx ON public.payment_schedules(organization_id, payment_reference);
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS payer_ibans text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','bank'));
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS bank_transaction_id uuid;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reversed_by uuid;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reverse_reason text;
GRANT UPDATE ON public.payments TO authenticated;

-- Organization bank settings
CREATE TABLE public.bank_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  auto_match_enabled boolean NOT NULL DEFAULT false,
  check_times text[] NOT NULL DEFAULT ARRAY['08:00','13:00','19:00'],
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  provider text NOT NULL,
  bank_name text,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','connecting','connected','reauth_required','error','disconnected')),
  secret_ref text,
  consent_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_check_at timestamptz,
  last_error text,
  sync_lock_until timestamptz,
  sync_cursor text,
  created_by uuid,
  disconnected_at timestamptz,
  disconnected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE RESTRICT,
  provider_account_id text NOT NULL,
  iban text,
  owner_name text,
  currency text NOT NULL DEFAULT 'EUR',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, connection_id, provider_account_id)
);
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  provider_transaction_id text NOT NULL,
  booking_status text NOT NULL CHECK (booking_status IN ('booked','pending')),
  booking_date date,
  value_date date,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL,
  remittance text,
  counterparty_name text,
  counterparty_iban text,
  match_state text NOT NULL DEFAULT 'unmatched' CHECK (match_state IN ('unmatched','review','matched','excluded')),
  review_reason text,
  matched_automatically boolean NOT NULL DEFAULT false,
  matched_by uuid,
  matched_at timestamptz,
  exclude_reason text,
  is_sample boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account_id, provider_transaction_id)
);
CREATE INDEX bank_transactions_org_state_idx ON public.bank_transactions(organization_id, match_state, booking_date DESC);

ALTER TABLE public.payments ADD CONSTRAINT payments_bank_tx_fkey FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX payments_bank_tx_schedule_uidx ON public.payments(bank_transaction_id, schedule_id) WHERE reversed_at IS NULL AND bank_transaction_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.bank_settings TO authenticated;
GRANT SELECT ON public.bank_connections, public.bank_accounts, public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_settings, public.bank_connections, public.bank_accounts, public.bank_transactions TO service_role;
ALTER TABLE public.bank_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Permissions: view_finance (existing), match_payments, manage_bank (owner unless granted)
CREATE OR REPLACE FUNCTION public.has_organization_permission(_org uuid, _permission text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_role org_role; v_override boolean; v_defaults text[];
BEGIN
  v_role := public.my_org_role(_org);
  IF v_role IS NULL OR _org IS NULL THEN RETURN false; END IF;
  IF v_role = 'owner' THEN RETURN true; END IF;
  SELECT allowed INTO v_override FROM public.user_permissions
   WHERE user_id = auth.uid() AND permission = _permission AND organization_id = _org LIMIT 1;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;
  SELECT rp.allowed INTO v_override FROM public.role_permissions rp
   WHERE rp.organization_id = _org AND rp.permission = _permission
     AND public.app_to_org_role(rp.role) = v_role LIMIT 1;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;
  v_defaults := CASE _permission
    WHEN 'view_calendar' THEN ARRAY['admin','operations_manager','property_manager','reception','cleaner']
    WHEN 'create_reservation' THEN ARRAY['admin','operations_manager','property_manager','reception']
    WHEN 'create_past_reservation' THEN ARRAY['admin']
    WHEN 'delete_reservation' THEN ARRAY['admin']
    WHEN 'manage_rooms' THEN ARRAY['admin']
    WHEN 'assign_cleaning' THEN ARRAY['admin','operations_manager','property_manager']
    WHEN 'do_cleaning' THEN ARRAY['admin','operations_manager','cleaner']
    WHEN 'view_finance' THEN ARRAY['admin','operations_manager']
    WHEN 'match_payments' THEN ARRAY['admin']
    WHEN 'manage_bank' THEN ARRAY[]::text[]
    WHEN 'pay_cleaners' THEN ARRAY['admin']
    WHEN 'manage_team' THEN ARRAY['admin']
    WHEN 'manage_settings' THEN ARRAY['admin']
    WHEN 'manage_integrations' THEN ARRAY['admin']
    WHEN 'manage_time' THEN ARRAY['admin','operations_manager','property_manager']
    ELSE ARRAY[]::text[] END;
  RETURN v_role::text = ANY(v_defaults);
END $function$;

CREATE POLICY "finance reads bank settings" ON public.bank_settings FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id, 'view_finance') OR public.has_organization_permission(organization_id, 'manage_bank'));
CREATE POLICY "bank managers insert settings" ON public.bank_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_organization_permission(organization_id, 'manage_bank'));
CREATE POLICY "bank managers update settings" ON public.bank_settings FOR UPDATE TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_bank')) WITH CHECK (public.has_organization_permission(organization_id, 'manage_bank'));
CREATE POLICY "finance reads connections" ON public.bank_connections FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id, 'view_finance') OR public.has_organization_permission(organization_id, 'manage_bank'));
CREATE POLICY "finance reads accounts" ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id, 'view_finance') OR public.has_organization_permission(organization_id, 'manage_bank'));
CREATE POLICY "finance reads transactions" ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.has_organization_permission(organization_id, 'view_finance'));

-- Bank-sourced payment rows may only be created by the matching RPCs
CREATE OR REPLACE FUNCTION public.payments_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amount numeric; v_sum numeric;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.source = 'bank' AND coalesce(current_setting('app.bank_match', true), '') <> 'on' THEN
    RAISE EXCEPTION 'bank payments are created by matching only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(current_setting('app.bank_match', true), '') <> 'on' THEN
      RAISE EXCEPTION 'payments are changed by matching only';
    END IF;
  END IF;
  IF NEW.bank_transaction_id IS NOT NULL AND NEW.reversed_at IS NULL THEN
    SELECT amount INTO v_amount FROM public.bank_transactions WHERE id = NEW.bank_transaction_id AND organization_id = NEW.organization_id;
    IF v_amount IS NULL THEN RAISE EXCEPTION 'bank transaction not in organization'; END IF;
    SELECT coalesce(sum(amount),0) INTO v_sum FROM public.payments
      WHERE bank_transaction_id = NEW.bank_transaction_id AND reversed_at IS NULL AND id <> NEW.id;
    IF v_sum + NEW.amount > v_amount THEN RAISE EXCEPTION 'allocations exceed bank transaction amount'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_guard BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_guard();

-- Internal match (used by server auto-match and by the user RPC after permission check)
CREATE OR REPLACE FUNCTION public._apply_bank_match(_tx_id uuid, _allocations jsonb, _link_payment_ids uuid[], _actor uuid, _auto boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx record; a jsonb; s record; n integer := 0; pid uuid;
BEGIN
  SELECT * INTO tx FROM public.bank_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found'; END IF;
  IF tx.booking_status <> 'booked' THEN RAISE EXCEPTION 'pending transactions cannot settle debts'; END IF;
  IF tx.amount <= 0 THEN RAISE EXCEPTION 'only incoming transactions can be matched'; END IF;
  IF tx.match_state IN ('matched','excluded') THEN RAISE EXCEPTION 'transaction already %', tx.match_state; END IF;
  IF tx.is_sample THEN RAISE EXCEPTION 'sample data cannot settle debts'; END IF;
  PERFORM set_config('app.bank_match', 'on', true);
  IF _link_payment_ids IS NOT NULL THEN
    FOREACH pid IN ARRAY _link_payment_ids LOOP
      UPDATE public.payments SET bank_transaction_id = tx.id
       WHERE id = pid AND organization_id = tx.organization_id AND bank_transaction_id IS NULL AND reversed_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'payment cannot be linked'; END IF;
      n := n + 1;
    END LOOP;
  END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(_allocations, '[]'::jsonb)) LOOP
    SELECT * INTO s FROM public.payment_schedules WHERE id = (a->>'schedule_id')::uuid AND organization_id = tx.organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'installment not in organization'; END IF;
    IF s.currency <> tx.currency THEN RAISE EXCEPTION 'currency mismatch'; END IF;
    IF _auto AND s.kind = 'deposit' THEN RAISE EXCEPTION 'deposits are never auto-allocated'; END IF;
    INSERT INTO public.payments (organization_id, property_id, reservation_id, schedule_id, amount, paid_on, method, note, source, bank_transaction_id, recorded_by)
    VALUES (s.organization_id, s.property_id, s.reservation_id, s.id, round((a->>'amount')::numeric, 2), coalesce(tx.booking_date, current_date), 'transfer', NULL, 'bank', tx.id, _actor);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'nothing to match'; END IF;
  UPDATE public.bank_transactions SET match_state = 'matched', matched_automatically = _auto, matched_by = _actor, matched_at = now(), review_reason = NULL, updated_at = now() WHERE id = tx.id;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public._apply_bank_match(uuid, jsonb, uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apply_bank_match(uuid, jsonb, uuid[], uuid, boolean) TO service_role;

-- payment_rows_before_write sets recorded_by := auth.uid(); keep actor for service role inserts
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
      NEW.recorded_by := coalesce(auth.uid(), NEW.recorded_by);
      IF NEW.schedule_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.payment_schedules s WHERE s.id = NEW.schedule_id AND s.reservation_id = NEW.reservation_id) THEN
        RAISE EXCEPTION 'schedule does not belong to reservation';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'payment_schedules' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.apply_bank_match(_tx_id uuid, _allocations jsonb, _link_payment_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.bank_transactions WHERE id = _tx_id;
  IF v_org IS NULL OR NOT public.has_organization_permission(v_org, 'match_payments') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public._apply_bank_match(_tx_id, _allocations, _link_payment_ids, auth.uid(), false);
END $$;

CREATE OR REPLACE FUNCTION public.unmatch_bank_transaction(_tx_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx record;
BEGIN
  SELECT * INTO tx FROM public.bank_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_organization_permission(tx.organization_id, 'match_payments') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF coalesce(length(trim(_reason)), 0) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;
  PERFORM set_config('app.bank_match', 'on', true);
  UPDATE public.payments SET reversed_at = now(), reversed_by = auth.uid(), reverse_reason = trim(_reason)
   WHERE bank_transaction_id = tx.id AND source = 'bank' AND reversed_at IS NULL;
  UPDATE public.payments SET bank_transaction_id = NULL
   WHERE bank_transaction_id = tx.id AND source = 'manual';
  UPDATE public.bank_transactions SET match_state = 'review', review_reason = 'reverted: ' || trim(_reason),
    matched_by = NULL, matched_at = NULL, matched_automatically = false, exclude_reason = NULL, updated_at = now()
   WHERE id = tx.id;
END $$;

CREATE OR REPLACE FUNCTION public.exclude_bank_transaction(_tx_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tx record;
BEGIN
  SELECT * INTO tx FROM public.bank_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_organization_permission(tx.organization_id, 'match_payments') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF tx.match_state = 'matched' THEN RAISE EXCEPTION 'unmatch first'; END IF;
  IF coalesce(length(trim(_reason)), 0) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;
  UPDATE public.bank_transactions SET match_state = 'excluded', exclude_reason = trim(_reason), matched_by = auth.uid(), matched_at = now(), updated_at = now() WHERE id = tx.id;
END $$;

SELECT public.attach_audit('public.bank_settings'::regclass);
SELECT public.attach_audit('public.bank_connections'::regclass);
SELECT public.attach_audit('public.bank_accounts'::regclass);
SELECT public.attach_audit('public.bank_transactions'::regclass);