CREATE OR REPLACE FUNCTION public.my_report_teams() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT CASE WHEN EXISTS(SELECT 1 FROM public.organization_members m JOIN public.organizations o ON o.id=m.organization_id AND o.active WHERE m.organization_id=public.active_organization_id() AND m.user_id=auth.uid() AND m.active AND m.role='owner') THEN ARRAY['all','cleaning','office','maintenance']::text[] ELSE ARRAY[]::text[] END $$;
REVOKE ALL ON FUNCTION public.my_report_teams() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_report_teams() TO authenticated,service_role;
COMMENT ON FUNCTION public.my_report_teams() IS 'Only the active organization owner may use the special work report; delegation does not apply.';
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef('public.department_work_report(date,date,uuid)'::regprocedure) INTO def;
IF position('IF auth.uid() IS NULL OR org IS NULL OR coalesce(cardinality(teams),0)=0 THEN' IN def)=0 THEN RAISE EXCEPTION 'Unexpected work report definition'; END IF;
EXECUTE replace(def,'IF auth.uid() IS NULL OR org IS NULL OR coalesce(cardinality(teams),0)=0 THEN','IF auth.uid() IS NULL OR org IS NULL OR NOT public.has_organization_role(org,ARRAY[''owner'']::public.org_role[]) OR coalesce(cardinality(teams),0)=0 THEN');
SELECT pg_get_functiondef('public.has_organization_permission(uuid,text)'::regprocedure) INTO def;
IF position('WHEN ''view_finance'' THEN ARRAY[''admin'',''operations_manager'']' IN def)=0 THEN RAISE EXCEPTION 'Unexpected permission definition'; END IF;
def:=replace(def,'WHEN ''view_finance'' THEN ARRAY[''admin'',''operations_manager'']','WHEN ''view_finance'' THEN ARRAY[]::text[]');
def:=replace(def,'WHEN ''match_payments'' THEN ARRAY[''admin'']','WHEN ''match_payments'' THEN ARRAY[]::text[]');
EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION public.can_finance_action(_org uuid,_property uuid,_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _org=public.active_organization_id() AND public.has_organization_permission(_org,_permission) AND EXISTS(SELECT 1 FROM public.properties p WHERE p.id=_property AND p.organization_id=_org AND public.can_access_property(p.id)) $$;
REVOKE ALL ON FUNCTION public.can_finance_action(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_finance_action(uuid,uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.can_manage_payments(_org uuid,_property uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_finance_action(_org,_property,'view_finance') $$;
COMMENT ON FUNCTION public.can_manage_payments(uuid,uuid) IS 'Read-only finance permission. Collection, plan editing and correction have separate permissions.';
ALTER POLICY "staff write schedules" ON public.payment_schedules WITH CHECK(public.can_finance_action(organization_id,property_id,'manage_payment_plans'));
ALTER POLICY "staff update schedules" ON public.payment_schedules USING(public.can_finance_action(organization_id,property_id,'manage_payment_plans')) WITH CHECK(public.can_finance_action(organization_id,property_id,'manage_payment_plans'));
ALTER POLICY "staff delete schedules" ON public.payment_schedules USING(public.can_finance_action(organization_id,property_id,'manage_payment_plans'));
ALTER POLICY "staff record payments" ON public.payments WITH CHECK(public.can_finance_action(organization_id,property_id,'collect_payments'));
ALTER POLICY "admins delete payments" ON public.payments USING(false);
REVOKE DELETE,UPDATE ON public.payments FROM authenticated;
CREATE OR REPLACE FUNCTION public.can_read_bank_transactions(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _org=public.active_organization_id() AND public.has_organization_permission(_org,'view_finance') AND (public.has_organization_permission(_org,'manage_bank') OR NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.organization_id=_org AND p.active AND NOT public.can_access_property(p.id))) $$;
REVOKE ALL ON FUNCTION public.can_read_bank_transactions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_bank_transactions(uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.can_read_bank_transactions(uuid) IS 'Unallocated bank activity cannot be safely attributed to one property; restricted property users cannot read organization-wide raw transactions.';
ALTER POLICY "finance reads transactions" ON public.bank_transactions USING(public.can_read_bank_transactions(organization_id));
ALTER POLICY "finance reads accounts" ON public.bank_accounts USING(public.has_organization_permission(organization_id,'manage_bank'));
ALTER POLICY "finance reads connections" ON public.bank_connections USING(public.has_organization_permission(organization_id,'manage_bank'));
ALTER POLICY "finance reads bank settings" ON public.bank_settings USING(public.has_organization_permission(organization_id,'manage_bank'));
CREATE OR REPLACE FUNCTION public.apply_bank_match(_tx_id uuid,_allocations jsonb,_link_payment_ids uuid[] DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; a jsonb; target record; pid uuid;
BEGIN
 SELECT organization_id INTO org FROM public.bank_transactions WHERE id=_tx_id FOR UPDATE;
 IF org IS NULL OR NOT public.can_read_bank_transactions(org) OR NOT public.has_organization_permission(org,'collect_payments') OR NOT public.has_organization_permission(org,'match_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 FOR a IN SELECT * FROM jsonb_array_elements(coalesce(_allocations,'[]'::jsonb)) LOOP
  SELECT organization_id,property_id INTO target FROM public.payment_schedules WHERE id=(a->>'schedule_id')::uuid;
  IF NOT FOUND OR target.organization_id<>org OR NOT public.can_finance_action(org,target.property_id,'collect_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 END LOOP;
 FOREACH pid IN ARRAY coalesce(_link_payment_ids,ARRAY[]::uuid[]) LOOP
  SELECT organization_id,property_id INTO target FROM public.payments WHERE id=pid;
  IF NOT FOUND OR target.organization_id<>org OR NOT public.can_finance_action(org,target.property_id,'collect_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN public._apply_bank_match(_tx_id,_allocations,_link_payment_ids,auth.uid(),false);
END $$;
DO $$ DECLARE name text; def text; BEGIN
FOREACH name IN ARRAY ARRAY['unmatch_bank_transaction','exclude_bank_transaction'] LOOP
 SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
 IF position('NOT public.has_organization_permission(tx.organization_id, ''match_payments'')' IN def)=0 THEN RAISE EXCEPTION 'Unexpected bank definition'; END IF;
 def:=replace(def,'NOT public.has_organization_permission(tx.organization_id, ''match_payments'')','NOT public.can_read_bank_transactions(tx.organization_id) OR NOT public.has_organization_permission(tx.organization_id, ''correct_payments'')');
 IF name='unmatch_bank_transaction' THEN def:=replace(def,'PERFORM set_config(''app.bank_match'', ''on'', true);','IF EXISTS(SELECT 1 FROM public.payments p WHERE p.bank_transaction_id=tx.id AND NOT public.can_finance_action(tx.organization_id,p.property_id,''correct_payments'')) THEN RAISE EXCEPTION ''Forbidden'' USING ERRCODE=''42501''; END IF; PERFORM set_config(''app.bank_match'', ''on'', true);'); END IF;
 EXECUTE def;
END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.reverse_manual_payment(_id uuid,_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record;
BEGIN
 SELECT * INTO p FROM public.payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_finance_action(p.organization_id,p.property_id,'correct_payments') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF coalesce(length(trim(_reason)),0)<3 THEN RAISE EXCEPTION 'reason required'; END IF;
 IF p.source<>'manual' OR p.bank_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'use bank reversal'; END IF;
 IF p.reversed_at IS NOT NULL THEN RETURN; END IF;
 PERFORM set_config('app.bank_match','on',true);
 UPDATE public.payments SET reversed_at=now(),reversed_by=auth.uid(),reverse_reason=trim(_reason) WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.reverse_manual_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_manual_payment(uuid,text) TO authenticated;
COMMENT ON FUNCTION public.reverse_manual_payment(uuid,text) IS 'Audited reasoned manual reversal; never deletes payment history and checks stored organization/property.';