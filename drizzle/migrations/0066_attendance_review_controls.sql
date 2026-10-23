CREATE OR REPLACE FUNCTION public.attendance_review_controls() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); settings jsonb; last_run jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT jsonb_build_object('warning_after_minutes',coalesce(s.warning_after_minutes,720),'review_after_minutes',coalesce(s.review_after_minutes,960)) INTO settings FROM (SELECT 1) dummy LEFT JOIN public.attendance_review_settings s ON s.organization_id=org;
 SELECT jsonb_build_object('status',status,'started_at',started_at,'finished_at',finished_at,'reviewed',detail->'reviewed') INTO last_run FROM public.cron_executions WHERE organization_id=org AND job='review_stale_shifts' ORDER BY started_at DESC LIMIT 1;
 RETURN settings || jsonb_build_object('last_run',last_run);
END $$;
REVOKE ALL ON FUNCTION public.attendance_review_controls() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attendance_review_controls() TO authenticated;
CREATE OR REPLACE FUNCTION public.save_attendance_review_controls(_warning integer,_review integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id();
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _warning IS NULL OR _review IS NULL OR _warning<60 OR _review<_warning OR _review>10080 THEN RAISE EXCEPTION 'invalid_threshold'; END IF;
 INSERT INTO public.attendance_review_settings(organization_id,warning_after_minutes,review_after_minutes,updated_at) VALUES(org,_warning,_review,now()) ON CONFLICT(organization_id) DO UPDATE SET warning_after_minutes=EXCLUDED.warning_after_minutes,review_after_minutes=EXCLUDED.review_after_minutes,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.save_attendance_review_controls(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_attendance_review_controls(integer,integer) TO authenticated;
SELECT public.attach_audit('public.attendance_review_settings'::regclass);