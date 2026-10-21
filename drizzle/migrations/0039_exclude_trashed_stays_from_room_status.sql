CREATE OR REPLACE VIEW public.room_operational_status WITH (security_invoker = true) AS
SELECT r.id AS room_id, r.organization_id, r.property_id,
CASE
WHEN r.status = 'maintenance'::public.room_status OR EXISTS (SELECT 1 FROM public.cleaning_tasks t WHERE t.room_id = r.id AND t.status = 'problem') THEN 'maintenance'::public.room_status
WHEN EXISTS (SELECT 1 FROM public.cleaning_tasks t WHERE t.room_id = r.id AND t.status = 'in_progress') THEN 'cleaning_in_progress'::public.room_status
WHEN EXISTS (SELECT 1 FROM public.reservations x WHERE x.room_id = r.id AND x.deleted_at IS NULL AND x.status NOT IN ('cancelled','no_show','checked_out') AND x.check_out = d.today) THEN 'checkout_today'::public.room_status
WHEN EXISTS (SELECT 1 FROM public.reservations x WHERE x.room_id = r.id AND x.deleted_at IS NULL AND x.status NOT IN ('cancelled','no_show','checked_out') AND x.check_in <= d.today AND x.check_out > d.today) THEN 'occupied'::public.room_status
WHEN EXISTS (SELECT 1 FROM public.cleaning_tasks t WHERE t.room_id = r.id AND t.status IN ('pending','accepted') AND (t.due_at AT TIME ZONE 'Europe/Berlin')::date <= d.today) THEN 'cleaning_required'::public.room_status
ELSE r.status END AS status
FROM public.rooms r
JOIN public.organizations o ON o.id = r.organization_id
CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE 'Europe/Berlin')::date AS today) d;
GRANT SELECT ON public.room_operational_status TO authenticated, service_role;