CREATE TABLE public.tv_displays (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
 token_hash text NOT NULL UNIQUE,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
GRANT SELECT ON public.tv_displays TO authenticated;
GRANT ALL ON public.tv_displays TO service_role;
ALTER TABLE public.tv_displays ENABLE ROW LEVEL SECURITY;
CREATE POLICY tv_admin_read ON public.tv_displays FOR SELECT TO authenticated USING (organization_id=public.active_organization_id() AND public.is_org_admin(organization_id));
CREATE TABLE public.tv_source_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 colors jsonb NOT NULL DEFAULT '{"booking":"#003580","airbnb":"#ff5a5f","expedia":"#fbcc33","check24":"#005ea8","website":"#10b981","direct":"#f59e0b"}'::jsonb
);
GRANT SELECT ON public.tv_source_settings TO authenticated;
GRANT ALL ON public.tv_source_settings TO service_role;
ALTER TABLE public.tv_source_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tv_colors_read ON public.tv_source_settings FOR SELECT TO authenticated USING (organization_id=public.active_organization_id());
CREATE FUNCTION public.save_tv_source_colors(_colors jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); k text;
BEGIN
 IF org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF jsonb_typeof(_colors)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(_colors))<>6 THEN RAISE EXCEPTION 'invalid_colors'; END IF;
 FOREACH k IN ARRAY ARRAY['booking','airbnb','expedia','check24','website','direct'] LOOP
  IF coalesce(_colors->>k,'') !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'invalid_colors'; END IF;
 END LOOP;
 INSERT INTO public.tv_source_settings(organization_id,colors) VALUES(org,_colors) ON CONFLICT(organization_id) DO UPDATE SET colors=excluded.colors;
END $$;
REVOKE ALL ON FUNCTION public.save_tv_source_colors(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_tv_source_colors(jsonb) TO authenticated;
CREATE FUNCTION public.create_tv_display(_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id(); token text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''); display_id uuid;
BEGIN
 IF org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(trim(_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'invalid_name'; END IF;
 IF (SELECT count(*) FROM public.tv_displays WHERE organization_id=org AND revoked_at IS NULL)>=10 THEN RAISE EXCEPTION 'display_limit'; END IF;
 INSERT INTO public.tv_displays(organization_id,name,token_hash,created_by) VALUES(org,trim(_name),encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid()) RETURNING id INTO display_id;
 RETURN jsonb_build_object('id',display_id,'token',token);
END $$;
REVOKE ALL ON FUNCTION public.create_tv_display(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_tv_display(text) TO authenticated;
CREATE FUNCTION public.revoke_tv_display(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid:=public.active_organization_id();
BEGIN
 IF org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.tv_displays SET revoked_at=coalesce(revoked_at,now()) WHERE id=_id AND organization_id=org;
END $$;
REVOKE ALL ON FUNCTION public.revoke_tv_display(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_tv_display(uuid) TO authenticated;
CREATE FUNCTION public.tv_snapshot(_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; org_name text; today date:=(now() AT TIME ZONE 'Europe/Berlin')::date; props jsonb; totals jsonb; weekly jsonb; events jsonb; dues jsonb; colors jsonb;
BEGIN
 IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT d.organization_id,o.name INTO org,org_name FROM public.tv_displays d JOIN public.organizations o ON o.id=d.organization_id AND o.active WHERE d.token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') AND d.revoked_at IS NULL;
 IF org IS NULL THEN RETURN NULL; END IF;
 WITH counts AS (
 SELECT p.name,
 count(r.id)::int AS total,
 count(r.id) FILTER(WHERE s.status IN ('occupied','checkout_today'))::int AS occupied,
 count(r.id) FILTER(WHERE s.status IN ('available','cleaned'))::int AS ready,
 count(r.id) FILTER(WHERE s.status IN ('cleaning_required','cleaning_in_progress'))::int AS cleaning,
 count(r.id) FILTER(WHERE s.status='maintenance')::int AS maintenance,
 (SELECT count(*)::int FROM public.reservations x WHERE x.organization_id=org AND x.property_id=p.id AND x.deleted_at IS NULL AND x.status NOT IN ('cancelled','no_show','checked_out') AND x.check_in=today) AS arrivals,
 (SELECT count(*)::int FROM public.reservations x WHERE x.organization_id=org AND x.property_id=p.id AND x.deleted_at IS NULL AND x.status NOT IN ('cancelled','no_show') AND x.check_out=today) AS departures
 FROM public.properties p LEFT JOIN public.rooms r ON r.property_id=p.id AND r.organization_id=org AND r.active LEFT JOIN public.room_operational_status s ON s.room_id=r.id AND s.organization_id=org
 WHERE p.organization_id=org AND p.active GROUP BY p.id,p.name)
 SELECT coalesce(jsonb_agg(to_jsonb(counts) ORDER BY name),'[]'::jsonb),jsonb_build_object('total',coalesce(sum(total),0),'occupied',coalesce(sum(occupied),0),'ready',coalesce(sum(ready),0),'cleaning',coalesce(sum(cleaning),0),'maintenance',coalesce(sum(maintenance),0),'arrivals',coalesce(sum(arrivals),0),'departures',coalesce(sum(departures),0),'created',(SELECT count(DISTINCT coalesce(booking_id,id)) FROM public.reservations WHERE organization_id=org AND deleted_at IS NULL AND created_at>=today::timestamp AT TIME ZONE 'Europe/Berlin' AND created_at<(today+1)::timestamp AT TIME ZONE 'Europe/Berlin')) INTO props,totals FROM counts;
 SELECT jsonb_agg(jsonb_build_object('day',day::date,'arrivals',(SELECT count(*) FROM public.reservations r WHERE r.organization_id=org AND r.deleted_at IS NULL AND r.status NOT IN ('cancelled','no_show','checked_out') AND r.check_in=day::date),'departures',(SELECT count(*) FROM public.reservations r WHERE r.organization_id=org AND r.deleted_at IS NULL AND r.status NOT IN ('cancelled','no_show') AND r.check_out=day::date)) ORDER BY day) INTO weekly FROM generate_series(today::timestamp,(today+6)::timestamp,interval '1 day') day;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'at',a.created_at,'kind',CASE a.entity WHEN 'reservations' THEN CASE a.action WHEN 'INSERT' THEN 'reservation_created' WHEN 'DELETE' THEN 'reservation_removed' ELSE 'reservation_updated' END WHEN 'cleaning_tasks' THEN 'cleaning_updated' WHEN 'room_issues' THEN 'maintenance_updated' ELSE 'task_updated' END,'source',coalesce(r.channel::text,'direct')) ORDER BY a.created_at DESC),'[]'::jsonb) INTO events FROM (SELECT id,entity,entity_id,action,created_at FROM public.audit_logs WHERE organization_id=org AND entity IN ('reservations','cleaning_tasks','room_issues','todos') AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 20) a LEFT JOIN public.reservations r ON a.entity='reservations' AND a.entity_id=r.id::text AND r.organization_id=org;
 WITH balances AS (SELECT s.due_date,greatest(s.amount-coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.schedule_id=s.id AND p.organization_id=org),0),0) AS remaining FROM public.payment_schedules s JOIN public.reservations r ON r.id=s.reservation_id AND r.organization_id=org AND r.deleted_at IS NULL AND r.status NOT IN ('cancelled','no_show') WHERE s.organization_id=org)
 SELECT jsonb_build_object('overdue',count(*) FILTER(WHERE due_date<today AND remaining>0),'dueToday',count(*) FILTER(WHERE due_date=today AND remaining>0),'dueWeek',count(*) FILTER(WHERE due_date BETWEEN today AND today+6 AND remaining>0)) INTO dues FROM balances;
 SELECT s.colors INTO colors FROM public.tv_source_settings s WHERE s.organization_id=org;
 RETURN jsonb_build_object('organization',org_name,'at',now(),'day',today,'totals',totals,'properties',props,'weekly',weekly,'events',events,'dues',dues,'colors',coalesce(colors,'{"booking":"#003580","airbnb":"#ff5a5f","expedia":"#fbcc33","check24":"#005ea8","website":"#10b981","direct":"#f59e0b"}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.tv_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_snapshot(text) TO anon,authenticated;
COMMENT ON TABLE public.tv_displays IS 'Revocable read-only organization display identities. Only hashes are stored; no ordinary user privileges.';
COMMENT ON FUNCTION public.tv_snapshot(text) IS 'Anonymous allowlisted aggregates only. Never add names, contact details, room codes, personal amounts, coordinates, or time records.';