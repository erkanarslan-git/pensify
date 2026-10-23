CREATE TABLE public.payment_receipts(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),reservation_id uuid NOT NULL REFERENCES public.reservations(id),amount numeric(14,2) NOT NULL CHECK(amount>0),request_payload jsonb NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.payment_receipts TO authenticated; GRANT ALL ON public.payment_receipts TO service_role; ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipt_read ON public.payment_receipts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.reservations r WHERE r.id=reservation_id AND public.can_finance_action(r.organization_id,r.property_id,'view_finance')));
ALTER TABLE public.payments ADD COLUMN receipt_id uuid REFERENCES public.payment_receipts(id);
ALTER TABLE public.payments ADD COLUMN kind text NOT NULL DEFAULT 'rent' CHECK(kind IN('rent','deposit','unallocated'));
CREATE OR REPLACE FUNCTION public.guard_payment_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; paid numeric; bank_amount numeric;
BEGIN
 PERFORM 1 FROM public.reservations WHERE id=NEW.reservation_id FOR UPDATE;
 IF NEW.amount<>round(NEW.amount,2) OR NEW.amount<=0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
 IF NEW.schedule_id IS NOT NULL THEN
 SELECT * INTO s FROM public.payment_schedules WHERE id=NEW.schedule_id FOR UPDATE;
 IF s.id IS NULL OR s.reservation_id<>NEW.reservation_id THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
 IF NEW.reversed_at IS NULL THEN SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE schedule_id=s.id AND reversed_at IS NULL AND id<>NEW.id;
 IF paid+NEW.amount>s.amount THEN RAISE EXCEPTION 'allocation_exceeds_remaining'; END IF; END IF;
 NEW.kind:=CASE WHEN s.kind='deposit' THEN 'deposit' ELSE 'rent' END;
 END IF;
 IF NEW.bank_transaction_id IS NOT NULL AND NEW.reversed_at IS NULL THEN
 SELECT amount INTO bank_amount FROM public.bank_transactions WHERE id=NEW.bank_transaction_id FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE bank_transaction_id=NEW.bank_transaction_id AND reversed_at IS NULL AND id<>NEW.id;
 IF bank_amount IS NULL OR paid+NEW.amount>bank_amount THEN RAISE EXCEPTION 'allocation_exceeds_bank_amount'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_balance_guard BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_payment_balance();
CREATE OR REPLACE FUNCTION public.collect_payment_receipt(_request_id uuid,_reservation uuid,_amount numeric,_date date,_method text,_note text,_allocations jsonb,_kind text DEFAULT 'rent') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; prior record; payload jsonb; allocation jsonb; s record; assigned numeric:=0; value numeric;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=_reservation FOR UPDATE;
 IF r.id IS NULL OR r.deleted_at IS NOT NULL OR NOT public.can_finance_action(r.organization_id,r.property_id,'collect_payments') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _amount<=0 OR _amount<>round(_amount,2) OR _amount>999999999999 OR _date IS NULL OR _method NOT IN('cash','transfer','card','other') OR _kind NOT IN('rent','deposit') OR jsonb_typeof(_allocations)<>'array' OR jsonb_array_length(_allocations)>120 THEN RAISE EXCEPTION 'invalid_payment'; END IF;
 payload:=jsonb_build_object('reservation',_reservation,'amount',_amount,'date',_date,'method',_method,'note',_note,'allocations',_allocations,'kind',_kind);
 SELECT * INTO prior FROM public.payment_receipts WHERE id=_request_id;
 IF prior.id IS NOT NULL THEN IF prior.organization_id<>r.organization_id OR prior.created_by<>auth.uid() OR prior.request_payload<>payload THEN RAISE EXCEPTION 'request_conflict'; END IF; RETURN prior.id; END IF;
 INSERT INTO public.payment_receipts(id,organization_id,reservation_id,amount,request_payload,created_by) VALUES(_request_id,r.organization_id,r.id,_amount,payload,auth.uid());
 FOR allocation IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
 value:=(allocation->>'amount')::numeric;
 SELECT * INTO s FROM public.payment_schedules WHERE id=(allocation->>'schedule_id')::uuid AND reservation_id=r.id FOR UPDATE;
 IF s.id IS NULL OR value<=0 OR value<>round(value,2) OR (s.kind='deposit')<>(_kind='deposit') THEN RAISE EXCEPTION 'invalid_allocation'; END IF;
 assigned:=assigned+value; IF assigned>_amount THEN RAISE EXCEPTION 'allocations_exceed_receipt'; END IF;
 INSERT INTO public.payments(reservation_id,schedule_id,amount,paid_on,method,note,receipt_id,kind) VALUES(r.id,s.id,value,_date,_method,_note,_request_id,_kind);
 END LOOP;
 IF assigned<_amount THEN INSERT INTO public.payments(reservation_id,amount,paid_on,method,note,receipt_id,kind) VALUES(r.id,_amount-assigned,_date,_method,_note,_request_id,CASE WHEN _kind='deposit' THEN 'deposit' ELSE 'unallocated' END); END IF;
 RETURN _request_id;
END $$;
CREATE OR REPLACE FUNCTION public.replace_payment_plan(_reservation uuid,_rows jsonb,_retained jsonb,_ibans text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; current_retained jsonb; row_data jsonb; months text[]:=ARRAY[]::text[]; d date; a numeric;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=_reservation FOR UPDATE;
 IF r.id IS NULL OR r.deleted_at IS NOT NULL OR NOT public.can_finance_action(r.organization_id,r.property_id,'manage_payment_plans') THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM 1 FROM public.payment_schedules WHERE reservation_id=r.id ORDER BY id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'due_date',s.due_date,'amount',s.amount) ORDER BY s.id),'[]') INTO current_retained FROM public.payment_schedules s WHERE s.reservation_id=r.id AND s.kind='rent' AND EXISTS(SELECT 1 FROM public.payments WHERE schedule_id=s.id);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_retained) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_retained) y WHERE x=y)) OR jsonb_array_length(current_retained)<>jsonb_array_length(_retained) THEN RAISE EXCEPTION 'plan_changed_retry'; END IF;
 IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)>240 OR (jsonb_array_length(_rows)=0 AND jsonb_array_length(current_retained)=0) THEN RAISE EXCEPTION 'invalid_plan'; END IF;
 SELECT coalesce(array_agg(x->>'due_date'),'{}') INTO months FROM jsonb_array_elements(current_retained) x;
 SELECT coalesce(array_agg(substring(v FROM 1 FOR 7)),'{}') INTO months FROM unnest(months) v;
 FOR row_data IN SELECT * FROM jsonb_array_elements(_rows) LOOP
 d:=(row_data->>'due_date')::date; a:=(row_data->>'amount')::numeric;
 IF d<r.check_in OR d>=r.check_out OR a<=0 OR a<>round(a,2) OR to_char(d,'YYYY-MM')=ANY(months) THEN RAISE EXCEPTION 'invalid_plan_row'; END IF; months:=array_append(months,to_char(d,'YYYY-MM'));
 END LOOP;
 IF cardinality(_ibans)>20 OR EXISTS(SELECT 1 FROM unnest(_ibans) i WHERE i IS NULL OR length(i)>34 OR i !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$') THEN RAISE EXCEPTION 'invalid_iban'; END IF;
 UPDATE public.reservations SET payer_ibans=coalesce(_ibans,ARRAY[]::text[]) WHERE id=r.id;
 DELETE FROM public.payment_schedules s WHERE s.reservation_id=r.id AND s.kind='rent' AND NOT EXISTS(SELECT 1 FROM public.payments WHERE schedule_id=s.id);
 INSERT INTO public.payment_schedules(reservation_id,due_date,amount) SELECT r.id,(x->>'due_date')::date,(x->>'amount')::numeric FROM jsonb_array_elements(_rows) x;
END $$;
CREATE OR REPLACE FUNCTION public.preserve_financial_reservation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF EXISTS(SELECT 1 FROM public.payments WHERE reservation_id=OLD.id) OR EXISTS(SELECT 1 FROM public.payment_schedules WHERE reservation_id=OLD.id) OR EXISTS(SELECT 1 FROM public.payment_receipts WHERE reservation_id=OLD.id) THEN RAISE EXCEPTION 'financial_history_requires_archive'; END IF; RETURN OLD; END $$;
CREATE TRIGGER preserve_reservation_finance BEFORE DELETE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.preserve_financial_reservation();
REVOKE ALL ON FUNCTION public.collect_payment_receipt(uuid,uuid,numeric,date,text,text,jsonb,text),public.replace_payment_plan(uuid,jsonb,jsonb,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collect_payment_receipt(uuid,uuid,numeric,date,text,text,jsonb,text),public.replace_payment_plan(uuid,jsonb,jsonb,text[]) TO authenticated;