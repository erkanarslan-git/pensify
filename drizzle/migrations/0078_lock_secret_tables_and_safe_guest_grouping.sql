REVOKE ALL ON public.operational_access_secrets FROM anon,authenticated;
DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.guest_directory(text,text,integer,integer)'::regprocedure) INTO d;
 d:=regexp_replace(d,'CASE WHEN r.customer_type=.*?END AS identity_key','CASE WHEN r.booking_id IS NOT NULL THEN ''booking:''||r.booking_id::text ELSE ''reservation:''||r.id::text END AS identity_key','s');
 IF position('''booking:''||r.booking_id::text' IN d)=0 THEN RAISE EXCEPTION 'guest identity patch missing'; END IF; EXECUTE d;
END $$;