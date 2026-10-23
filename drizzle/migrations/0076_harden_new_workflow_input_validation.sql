DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.collect_payment_receipt(uuid,uuid,numeric,date,text,text,jsonb,text)'::regprocedure) INTO d;
d:=replace(d,'IF _amount<=0','IF _request_id IS NULL OR _amount IS NULL OR _method IS NULL OR _kind IS NULL OR _allocations IS NULL OR _amount<=0');
d:=replace(d,'IF s.id IS NULL OR value<=0','IF value IS NULL OR s.id IS NULL OR value<=0'); EXECUTE d;
SELECT pg_get_functiondef('public.replace_payment_plan(uuid,jsonb,jsonb,text[])'::regprocedure) INTO d;
d:=replace(d,'IF jsonb_typeof(_rows)', 'IF _rows IS NULL OR _retained IS NULL OR jsonb_typeof(_rows)'); d:=replace(d,'IF d<r.check_in','IF d IS NULL OR a IS NULL OR d<r.check_in'); EXECUTE d;
SELECT pg_get_functiondef('public.finance_dashboard(date)'::regprocedure) INTO d;
d:=replace(d,$old$to_jsonb(r)-'payer_ibans'$old$, $new$(to_jsonb(r)-'payer_ibans')||CASE WHEN public.can_finance_action(org,r.property_id,'manage_payment_plans') THEN jsonb_build_object('payer_ibans',r.payer_ibans) ELSE '{}'::jsonb END$new$); EXECUTE d;
END $$;