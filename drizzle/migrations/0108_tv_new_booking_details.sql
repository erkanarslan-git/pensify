CREATE OR REPLACE FUNCTION public.tv_snapshot_v2(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE org uuid; org_name text; rotation integer; today date:=(now() AT TIME ZONE 'Europe/Berlin')::date; start_at timestamptz; end_at timestamptz; result jsonb;
BEGIN
 IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT d.organization_id,o.name,d.rotation_seconds INTO org,org_name,rotation FROM public.tv_displays d JOIN public.organizations o ON o.id=d.organization_id AND o.active WHERE d.token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') AND d.revoked_at IS NULL;
 IF org IS NULL THEN RETURN NULL; END IF;
 start_at:=today::timestamp AT TIME ZONE 'Europe/Berlin'; end_at:=(today+1)::timestamp AT TIME ZONE 'Europe/Berlin';
 WITH locations AS (SELECT id,name FROM public.properties WHERE organization_id=org AND active),
 stays AS (SELECT r.* FROM public.reservations r JOIN locations p ON p.id=r.property_id WHERE r.organization_id=org AND r.deleted_at IS NULL),
 room_states AS (
 SELECT r.id,r.property_id,s.status,
 EXISTS(SELECT 1 FROM stays x WHERE x.room_id=r.id AND x.status='checked_in') AS occupied,
 (s.status IN ('available','cleaned') AND NOT EXISTS(SELECT 1 FROM stays x WHERE x.room_id=r.id AND x.status='checked_in')) AS ready
 FROM public.rooms r JOIN locations p ON p.id=r.property_id JOIN public.room_operational_status s ON s.room_id=r.id AND s.organization_id=org WHERE r.organization_id=org AND r.active),
 property_counts AS (
 SELECT p.name,count(rs.id)::int total,count(rs.id) FILTER(WHERE rs.occupied)::int occupied,count(rs.id) FILTER(WHERE rs.ready)::int ready,
 count(rs.id) FILTER(WHERE rs.status IN ('cleaning_required','cleaning_in_progress'))::int cleaning,count(rs.id) FILTER(WHERE rs.status='maintenance')::int maintenance,
 (SELECT count(*) FROM stays x WHERE x.property_id=p.id AND x.check_in=today AND x.status NOT IN ('cancelled','no_show'))::int arrivals,
 (SELECT count(*) FROM stays x WHERE x.property_id=p.id AND x.check_out=today AND x.status NOT IN ('cancelled','no_show'))::int departures
 FROM locations p LEFT JOIN room_states rs ON rs.property_id=p.id GROUP BY p.id,p.name),
 booking_groups AS (
 SELECT coalesce(r.booking_id,r.id) id,min(coalesce(b.created_at,r.created_at)) first_at,
 CASE WHEN bool_or(r.tv_origin='manual') THEN 'manual' WHEN bool_or(r.tv_origin IN ('automatic','import')) THEN 'automatic' ELSE 'unknown' END origin
 FROM public.reservations r JOIN locations p ON p.id=r.property_id LEFT JOIN public.bookings b ON b.id=r.booking_id AND b.organization_id=org WHERE r.organization_id=org GROUP BY coalesce(r.booking_id,r.id)),
 today_bookings AS (SELECT * FROM booking_groups WHERE first_at>=start_at AND first_at<end_at),
 cleaning_jobs AS (SELECT t.* FROM public.cleaning_tasks t JOIN locations p ON p.id=t.property_id WHERE t.organization_id=org),
 issues AS (SELECT i.* FROM public.room_issues i JOIN locations p ON p.id=i.property_id WHERE i.organization_id=org),
 expected_arrival_rooms AS (SELECT DISTINCT r.room_id FROM stays r WHERE r.check_in=today AND r.status IN ('confirmed','tentative')),
 unpaid AS (SELECT s.id,s.due_date,s.amount,coalesce(sum(p.amount) FILTER(WHERE p.reversed_at IS NULL),0) paid FROM public.payment_schedules s JOIN stays r ON r.id=s.reservation_id AND r.status NOT IN ('cancelled','no_show') LEFT JOIN public.payments p ON p.schedule_id=s.id AND p.organization_id=org WHERE s.organization_id=org AND s.kind='rent' GROUP BY s.id),
 raw_events AS (
 SELECT a.id::text audit_id,a.created_at at,a.entity,a.action,a.entity_id,
 coalesce(a.diff->'new',a.diff->'old') payload,
 CASE WHEN a.entity='reservations' AND a.action='INSERT' THEN coalesce(a.diff->'new'->>'booking_id',a.entity_id) ELSE a.id::text END event_key
 FROM public.audit_logs a WHERE a.organization_id=org AND a.entity IN ('reservations','cleaning_tasks','room_issues','todos') AND a.created_at>now()-interval '24 hours'),
 first_booking_events AS (SELECT coalesce(a.diff->'new'->>'booking_id',a.entity_id) event_key,min(a.created_at) first_at FROM public.audit_logs a WHERE a.organization_id=org AND a.entity='reservations' AND a.action='INSERT' GROUP BY coalesce(a.diff->'new'->>'booking_id',a.entity_id)),
 safe_events AS (
 SELECT DISTINCT ON(e.event_key) e.event_key id,e.at,
 CASE e.entity WHEN 'reservations' THEN CASE e.action WHEN 'INSERT' THEN 'reservation_created' WHEN 'DELETE' THEN 'reservation_removed' ELSE 'reservation_updated' END WHEN 'cleaning_tasks' THEN 'cleaning_updated' WHEN 'room_issues' THEN 'maintenance_updated' ELSE 'task_updated' END kind,
 CASE WHEN e.entity='reservations' THEN coalesce(e.payload->>'channel','direct') ELSE 'operation' END source,
 coalesce(p.name,'') location,
 (e.entity='reservations' AND e.action='INSERT' AND f.first_at=e.at AND (
 (r.tv_origin='manual' AND r.created_at>=e.at-interval '1 minute') OR
 (r.tv_origin='automatic' AND r.external_created_at>=e.at-interval '2 minutes' AND r.external_created_at<=e.at+interval '1 minute')) AND r.deleted_at IS NULL AND r.status NOT IN ('cancelled','no_show')) eligible,
 rm.number room_number,r.check_in stay_from,r.check_out stay_to
 FROM raw_events e LEFT JOIN locations p ON p.id::text=e.payload->>'property_id'
 LEFT JOIN public.reservations r ON e.entity='reservations' AND r.id::text=e.entity_id AND r.organization_id=org
 LEFT JOIN first_booking_events f ON f.event_key=e.event_key
 LEFT JOIN public.rooms rm ON rm.id=r.room_id AND rm.organization_id=org
 ORDER BY e.event_key,e.at ASC),
 latest_events AS (SELECT * FROM safe_events ORDER BY at DESC LIMIT 40)
 SELECT jsonb_build_object(
 'organization',org_name,'at',now(),'day',today,'rotationSeconds',rotation,
 'totals',jsonb_build_object('total',(SELECT count(*) FROM room_states),'occupied',(SELECT count(*) FROM room_states WHERE occupied),'ready',(SELECT count(*) FROM room_states WHERE ready),'cleaning',(SELECT count(*) FROM room_states WHERE status IN ('cleaning_required','cleaning_in_progress')),'maintenance',(SELECT count(*) FROM room_states WHERE status='maintenance'),'arrivals',(SELECT count(*) FROM stays WHERE check_in=today AND status NOT IN ('cancelled','no_show')),'departures',(SELECT count(*) FROM stays WHERE check_out=today AND status NOT IN ('cancelled','no_show')),'created',(SELECT count(*) FROM today_bookings)),
 'metrics',jsonb_build_object('created',(SELECT count(*) FROM today_bookings),'automatic',(SELECT count(*) FROM today_bookings WHERE origin='automatic'),'manual',(SELECT count(*) FROM today_bookings WHERE origin='manual'),'unknownOrigin',(SELECT count(*) FROM today_bookings WHERE origin='unknown'),
 'cleaned',(SELECT count(DISTINCT id) FROM cleaning_jobs WHERE status='completed' AND completed_at>=start_at AND completed_at<end_at),'review',(SELECT count(DISTINCT id) FROM cleaning_jobs WHERE inspection_state='pending'),
 'maintenanceDone',(SELECT count(DISTINCT id) FROM issues WHERE status='resolved' AND resolved_at>=start_at AND resolved_at<end_at),'maintenanceOpen',(SELECT count(*) FROM issues WHERE status='open'),
 'arrived',(SELECT count(*) FROM stays WHERE check_in=today AND status IN ('checked_in','checked_out')),'arrivalExpected',(SELECT count(*) FROM stays WHERE check_in=today AND status IN ('confirmed','tentative')),
 'departed',(SELECT count(*) FROM stays WHERE check_out=today AND status='checked_out'),'departureExpected',(SELECT count(*) FROM stays WHERE check_out=today AND status IN ('confirmed','tentative','checked_in'))),
 'properties',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY name) FROM property_counts p),'[]'::jsonb),
 'weekly',(SELECT jsonb_agg(jsonb_build_object('day',d::date,'arrivals',(SELECT count(*) FROM stays WHERE check_in=d::date AND status NOT IN ('cancelled','no_show')),'departures',(SELECT count(*) FROM stays WHERE check_out=d::date AND status NOT IN ('cancelled','no_show'))) ORDER BY d) FROM generate_series(today::timestamp,(today+6)::timestamp,interval '1 day') d),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'at',at,'kind',kind,'source',source,'location',location,'eligible',coalesce(eligible,false))||CASE WHEN kind='reservation_created' AND coalesce(eligible,false) THEN jsonb_strip_nulls(jsonb_build_object('room',room_number,'checkIn',stay_from,'checkOut',stay_to)) ELSE '{}'::jsonb END ORDER BY at DESC) FROM latest_events),'[]'::jsonb),
 'dues',jsonb_build_object('overdue',(SELECT count(*) FROM unpaid WHERE due_date<today AND paid<amount-0.005),'dueToday',(SELECT count(*) FROM unpaid WHERE due_date=today),'dueWeek',(SELECT count(*) FROM unpaid WHERE due_date BETWEEN today AND today+6 AND paid<amount-0.005),'paid',(SELECT count(*) FROM unpaid WHERE due_date=today AND paid>=amount-0.005),'partial',(SELECT count(*) FROM unpaid WHERE due_date=today AND paid>0 AND paid<amount-0.005),'open',(SELECT count(*) FROM unpaid WHERE due_date=today AND paid=0 AND amount>0)),
 'priorities',jsonb_build_object('arrivalNotReady',(SELECT count(*) FROM expected_arrival_rooms a LEFT JOIN room_states s ON s.id=a.room_id WHERE NOT coalesce(s.ready,false)),'cleaningPriority',(SELECT count(DISTINCT t.id) FROM cleaning_jobs t JOIN expected_arrival_rooms a ON a.room_id=t.room_id WHERE t.status IN ('pending','accepted','in_progress','problem')),'dueOpen',(SELECT count(*) FROM unpaid WHERE due_date=today AND paid<amount-0.005),'maintenanceBlocking',(SELECT count(DISTINCT i.id) FROM issues i JOIN expected_arrival_rooms a ON a.room_id=i.room_id WHERE i.status='open')),
 'colors',coalesce((SELECT colors FROM public.tv_source_settings WHERE organization_id=org),'{"booking":"#003580","airbnb":"#ff5a5f","expedia":"#fbcc33","check24":"#005ea8","website":"#10b981","direct":"#f59e0b"}'::jsonb)) INTO result;
 RETURN result;
END $function$;
COMMENT ON FUNCTION public.tv_snapshot_v2(text) IS 'Strict anonymous organization-scoped approved TV aggregate; celebrated new reservations expose only room number and stay dates (no guest data). Physical occupancy uses checked_in rooms; daily completions use current completed/resolved jobs; review means cleaning problem; import origins never celebrate.';