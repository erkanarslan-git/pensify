CREATE OR REPLACE FUNCTION public.tv_snapshot_v3(_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; org uuid; today date:=(now() AT TIME ZONE 'Europe/Berlin')::date; start_at timestamptz; end_at timestamptz; origins jsonb; details jsonb;
BEGIN
 result:=public.tv_snapshot_v2(_token);
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT organization_id INTO org FROM public.tv_displays WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') AND revoked_at IS NULL;
 IF org IS NULL THEN RETURN NULL; END IF;
 start_at:=today::timestamp AT TIME ZONE 'Europe/Berlin'; end_at:=(today+1)::timestamp AT TIME ZONE 'Europe/Berlin';
 WITH groups AS (
 SELECT coalesce(r.booking_id,r.id) id,min(coalesce(b.created_at,r.created_at)) first_at,
 CASE WHEN bool_and(r.tv_origin='manual') THEN 'manual' WHEN bool_and(r.tv_origin='automatic') THEN 'automatic' ELSE 'unknown' END origin
 FROM public.reservations r JOIN public.properties p ON p.id=r.property_id AND p.organization_id=org AND p.active LEFT JOIN public.bookings b ON b.id=r.booking_id AND b.organization_id=org WHERE r.organization_id=org GROUP BY coalesce(r.booking_id,r.id))
 SELECT jsonb_build_object('created',count(*),'manual',count(*) FILTER(WHERE origin='manual'),'automatic',count(*) FILTER(WHERE origin='automatic'),'unknownOrigin',count(*) FILTER(WHERE origin='unknown')) INTO origins FROM groups WHERE first_at>=start_at AND first_at<end_at;
 result:=jsonb_set(result,'{metrics}',(result->'metrics')||origins);
 result:=jsonb_set(result,'{totals,created}',origins->'created');
 WITH locations AS (SELECT id,name FROM public.properties WHERE organization_id=org AND active),
 expected AS (SELECT DISTINCT r.room_id,r.property_id FROM public.reservations r JOIN locations p ON p.id=r.property_id WHERE r.organization_id=org AND r.deleted_at IS NULL AND r.check_in=today AND r.status IN ('confirmed','tentative')),
 dues AS (SELECT s.id,r.property_id,s.amount,coalesce(sum(pay.amount) FILTER(WHERE pay.reversed_at IS NULL),0) paid FROM public.payment_schedules s JOIN public.reservations r ON r.id=s.reservation_id AND r.organization_id=org AND r.deleted_at IS NULL AND r.status NOT IN ('cancelled','no_show') JOIN locations l ON l.id=r.property_id LEFT JOIN public.payments pay ON pay.schedule_id=s.id AND pay.organization_id=org WHERE s.organization_id=org AND s.kind='rent' AND s.due_date=today GROUP BY s.id,r.property_id),
 counts AS (
 SELECT p.name location,
 (SELECT count(*) FROM expected e LEFT JOIN public.room_operational_status rs ON rs.room_id=e.room_id AND rs.organization_id=org WHERE e.property_id=p.id AND (rs.status IS NULL OR rs.status NOT IN ('available','cleaned') OR EXISTS(SELECT 1 FROM public.reservations r WHERE r.organization_id=org AND r.room_id=e.room_id AND r.deleted_at IS NULL AND r.status='checked_in')))::int "arrivalNotReady",
 (SELECT count(DISTINCT t.id) FROM public.cleaning_tasks t JOIN expected e ON e.room_id=t.room_id WHERE t.organization_id=org AND e.property_id=p.id AND t.status IN ('pending','accepted','in_progress','problem'))::int "cleaningPriority",
 (SELECT count(*) FROM dues d WHERE d.property_id=p.id AND d.paid<d.amount-0.005)::int "dueOpen",
 (SELECT count(DISTINCT i.id) FROM public.room_issues i JOIN expected e ON e.room_id=i.room_id JOIN public.room_operational_status rs ON rs.room_id=i.room_id AND rs.organization_id=org AND rs.status='maintenance' WHERE i.organization_id=org AND e.property_id=p.id AND i.status='open')::int "maintenanceBlocking"
 FROM locations p)
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY location) FILTER(WHERE "arrivalNotReady"+"cleaningPriority"+"dueOpen"+"maintenanceBlocking">0),'[]'::jsonb) INTO details FROM counts c;
 result:=jsonb_set(result,'{priorityDetails}',details);
 result:=jsonb_set(result,'{priorities}',jsonb_build_object('arrivalNotReady',coalesce((SELECT sum((d->>'arrivalNotReady')::int) FROM jsonb_array_elements(details) d),0),'cleaningPriority',coalesce((SELECT sum((d->>'cleaningPriority')::int) FROM jsonb_array_elements(details) d),0),'dueOpen',coalesce((SELECT sum((d->>'dueOpen')::int) FROM jsonb_array_elements(details) d),0),'maintenanceBlocking',coalesce((SELECT sum((d->>'maintenanceBlocking')::int) FROM jsonb_array_elements(details) d),0)));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.tv_snapshot_v3(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_snapshot_v3(text) TO anon,authenticated;
COMMENT ON FUNCTION public.tv_snapshot_v3(text) IS 'Verified revocable token via v2; origin categories partition daily bookings, imports and mixed origins are unknown not automatic; location-only priorities with no guest/staff/room identities, maintenance requires actual room sale block.';