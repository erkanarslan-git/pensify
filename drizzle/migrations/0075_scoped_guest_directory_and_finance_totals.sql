CREATE OR REPLACE FUNCTION public.guest_directory(_search text DEFAULT '',_kind text DEFAULT 'all',_page integer DEFAULT 0,_size integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.has_organization_role(org,ARRAY['owner','admin','operations_manager','property_manager','reception']::public.org_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _page<0 OR _size NOT IN(10,20,30,40,50) OR length(_search)>120 OR _kind NOT IN('all','individual','company') THEN RAISE EXCEPTION 'invalid_filter'; END IF;
 WITH scoped AS (
 SELECT r.*,b.company_vat_id,b.company_address,b.company_contact,
 CASE WHEN r.customer_type='company' AND nullif(trim(b.company_vat_id),'') IS NOT NULL THEN 'company:'||lower(trim(b.company_vat_id)) WHEN nullif(trim(r.guest_email),'') IS NOT NULL THEN 'email:'||lower(trim(r.guest_email)) WHEN nullif(regexp_replace(coalesce(r.guest_phone,''),'[^0-9+]','','g'),'') IS NOT NULL THEN 'phone:'||regexp_replace(r.guest_phone,'[^0-9+]','','g') ELSE 'reservation:'||r.id::text END AS identity_key
 FROM public.reservations r LEFT JOIN public.bookings b ON b.id=r.booking_id AND b.organization_id=org WHERE r.organization_id=org AND r.deleted_at IS NULL AND public.can_access_property(r.property_id)
 ), grouped AS (
 SELECT identity_key,customer_type,min(guest_name) AS name,min(company_name) AS company,min(guest_email) AS email,min(guest_phone) AS phone,min(company_vat_id) AS vat,min(company_address) AS address,count(*) AS stays,max(check_out) AS last_stay,
 jsonb_agg(jsonb_build_object('id',id,'check_in',check_in,'check_out',check_out,'status',status,'property_id',property_id)||CASE WHEN public.can_finance_action(org,property_id,'view_finance') THEN jsonb_build_object('revenue',revenue,'paid',coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.reservation_id=scoped.id AND p.reversed_at IS NULL AND p.kind<>'deposit'),0)) ELSE '{}'::jsonb END ORDER BY check_in DESC,id) AS reservations
 FROM scoped GROUP BY identity_key,customer_type
 ), filtered AS (SELECT * FROM grouped WHERE (_kind='all' OR customer_type=_kind) AND (_search='' OR position(lower(_search) IN lower(concat_ws(' ',name,company,email,phone,vat)))>0)), page_rows AS (SELECT * FROM filtered ORDER BY last_stay DESC,identity_key LIMIT _size OFFSET _page*_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(page_rows)) FROM page_rows),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.finance_dashboard(_today date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 WITH scoped AS (SELECT r.* FROM public.reservations r WHERE r.organization_id=org AND public.can_finance_action(org,r.property_id,'view_finance')),
 schedules AS (SELECT s.*,coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.schedule_id=s.id AND p.reversed_at IS NULL),0) AS paid,EXISTS(SELECT 1 FROM public.payments p WHERE p.schedule_id=s.id) AS "hasPayments" FROM public.payment_schedules s JOIN scoped r ON r.id=s.reservation_id),
 active_schedules AS (SELECT s.* FROM schedules s JOIN scoped r ON r.id=s.reservation_id WHERE r.deleted_at IS NULL AND r.status NOT IN('cancelled','no_show')),
 payments AS (SELECT p.* FROM public.payments p JOIN scoped r ON r.id=p.reservation_id)
 SELECT jsonb_build_object('schedules',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY due_date,id) FROM active_schedules s),'[]'),
 'payments',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY paid_on DESC,id) FROM payments p),'[]'),
 'reservations',coalesce((SELECT jsonb_agg(to_jsonb(r)-'payer_ibans') FROM scoped r WHERE r.deleted_at IS NULL AND r.status NOT IN('cancelled','no_show')),'[]'),
 'stats',jsonb_build_object('due',coalesce((SELECT sum(amount) FROM active_schedules WHERE kind='rent' AND to_char(due_date,'YYYY-MM')=to_char(_today,'YYYY-MM')),0),
 'unpaid',(SELECT count(*) FROM active_schedules WHERE kind='rent' AND amount>paid AND to_char(due_date,'YYYY-MM')=to_char(_today,'YYYY-MM')),
 'overdue',coalesce((SELECT sum(greatest(0,amount-paid)) FROM active_schedules WHERE kind='rent' AND due_date<_today),0),
 'collected',coalesce((SELECT sum(amount) FROM payments WHERE reversed_at IS NULL AND kind<>'deposit' AND to_char(paid_on,'YYYY-MM')=to_char(_today,'YYYY-MM')),0),
 'unallocated',coalesce((SELECT sum(amount) FROM payments WHERE reversed_at IS NULL AND kind='unallocated'),0),
 'deposit',coalesce((SELECT sum(amount) FROM payments WHERE reversed_at IS NULL AND kind='deposit'),0))) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.guest_directory(text,text,integer,integer),public.finance_dashboard(date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.guest_directory(text,text,integer,integer),public.finance_dashboard(date) TO authenticated;