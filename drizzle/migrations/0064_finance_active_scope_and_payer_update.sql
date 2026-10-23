ALTER POLICY "finance reads accounts" ON public.bank_accounts USING(organization_id=public.active_organization_id() AND public.has_organization_permission(organization_id,'manage_bank'));
ALTER POLICY "finance reads connections" ON public.bank_connections USING(organization_id=public.active_organization_id() AND public.has_organization_permission(organization_id,'manage_bank'));
ALTER POLICY "finance reads bank settings" ON public.bank_settings USING(organization_id=public.active_organization_id() AND public.has_organization_permission(organization_id,'manage_bank'));
ALTER POLICY "bank managers insert settings" ON public.bank_settings WITH CHECK(organization_id=public.active_organization_id() AND public.has_organization_permission(organization_id,'manage_bank'));
ALTER POLICY "bank managers update settings" ON public.bank_settings USING(organization_id=public.active_organization_id() AND public.has_organization_permission(organization_id,'manage_bank')) WITH CHECK(organization_id=public.active_organization_id() AND public.has_organization_permission(organization_id,'manage_bank'));
CREATE OR REPLACE FUNCTION public.save_reservation_payer_ibans(_reservation uuid,_ibans text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 SELECT organization_id,property_id INTO r FROM public.reservations WHERE id=_reservation AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_finance_action(r.organization_id,r.property_id,'manage_payment_plans') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF cardinality(_ibans)>20 OR EXISTS(SELECT 1 FROM unnest(_ibans) i WHERE i IS NULL OR length(i)>34 OR i !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$') THEN RAISE EXCEPTION 'invalid payer IBAN'; END IF;
 UPDATE public.reservations SET payer_ibans=coalesce(_ibans,ARRAY[]::text[]) WHERE id=_reservation;
END $$;
REVOKE ALL ON FUNCTION public.save_reservation_payer_ibans(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_reservation_payer_ibans(uuid,text[]) TO authenticated;
COMMENT ON FUNCTION public.save_reservation_payer_ibans(uuid,text[]) IS 'Narrow plan-editor payer update; active organization/property scoped; reservation audit preserved.';