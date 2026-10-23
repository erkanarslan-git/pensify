CREATE OR REPLACE FUNCTION public.finance_plan_candidates(_today date,_search text DEFAULT '',_page integer DEFAULT 0,_size integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _today IS NULL OR _search IS NULL OR length(_search)>120 OR _page IS NULL OR _page<0 OR _size IS NULL OR _size NOT IN(10,20,30,40,50) THEN RAISE EXCEPTION 'invalid_filter'; END IF;
 WITH filtered AS (SELECT r.id,r.guest_name,r.room_id,r.check_in,r.check_out,r.revenue,r.payer_ibans FROM public.reservations r WHERE r.organization_id=org AND r.deleted_at IS NULL AND r.status NOT IN('cancelled','no_show') AND r.check_out-r.check_in>=28 AND r.check_out>_today AND public.can_finance_action(org,r.property_id,'view_finance') AND public.can_finance_action(org,r.property_id,'manage_payment_plans') AND (_search='' OR position(lower(_search) IN lower(concat_ws(' ',r.guest_name,r.company_name)))>0)), page_rows AS (SELECT * FROM filtered ORDER BY check_in,id LIMIT _size OFFSET _page::bigint*_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY check_in,id) FROM page_rows r),'[]'::jsonb)) INTO result; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_plan_candidates(date,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_plan_candidates(date,text,integer,integer) TO authenticated;