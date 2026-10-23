CREATE OR REPLACE FUNCTION public.reservation_trash_blocker(_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM public.payments WHERE reservation_id=_id) OR EXISTS(SELECT 1 FROM public.payment_schedules WHERE reservation_id=_id) OR EXISTS(SELECT 1 FROM public.payment_receipts WHERE reservation_id=_id) THEN 'finance_history'
  WHEN EXISTS(SELECT 1 FROM public.todos WHERE reservation_id=_id) THEN 'linked_tasks'
  ELSE NULL END $$;
REVOKE ALL ON FUNCTION public.reservation_trash_blocker(uuid) FROM PUBLIC, anon, authenticated;

-- Shared purge step: removes only link rows owned by this stay; never cascades finance or tasks.
CREATE OR REPLACE FUNCTION public._purge_trashed_reservation(_id uuid, _cutoff timestamptz) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; blocker text;
BEGIN
 SELECT id, deleted_at INTO r FROM public.reservations WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.deleted_at IS NULL THEN RETURN 'not_in_trash'; END IF;
 IF _cutoff IS NOT NULL AND r.deleted_at > _cutoff THEN RETURN 'not_due'; END IF;
 blocker := public.reservation_trash_blocker(_id);
 IF blocker IS NOT NULL THEN RETURN blocker; END IF;
 DELETE FROM public.reservation_occupants WHERE reservation_id=_id;
 DELETE FROM public.reservation_customers WHERE reservation_id=_id;
 DELETE FROM public.reservations WHERE id=_id;
 RETURN 'purged';
END $$;
REVOKE ALL ON FUNCTION public._purge_trashed_reservation(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_reservation(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid; result text;
BEGIN
 SELECT organization_id INTO org FROM public.reservations WHERE id=_id AND deleted_at IS NOT NULL;
 IF org IS NULL THEN RAISE EXCEPTION 'not_in_trash'; END IF;
 IF NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 result := public._purge_trashed_reservation(_id, NULL);
 IF result <> 'purged' THEN RAISE EXCEPTION '%', result USING ERRCODE='check_violation'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.restore_reservation(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
 SELECT id, organization_id, property_id, room_id, check_in, check_out, deleted_at, status_before_delete INTO r FROM public.reservations WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.deleted_at IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT public.is_org_admin(r.organization_id) OR NOT public.can_access_property(r.property_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 -- Serialize placements on the room so two restores/bookings cannot both win.
 PERFORM 1 FROM public.rooms WHERE id=r.room_id FOR UPDATE;
 IF COALESCE(r.status_before_delete,'confirmed') NOT IN ('cancelled','no_show') AND EXISTS(
  SELECT 1 FROM public.reservations x WHERE x.room_id=r.room_id AND x.id<>r.id AND x.deleted_at IS NULL
   AND x.status NOT IN ('cancelled','no_show') AND daterange(x.check_in,x.check_out,'[)') && daterange(r.check_in,r.check_out,'[)')) THEN
  RAISE EXCEPTION 'restore_overlap' USING ERRCODE='check_violation';
 END IF;
 UPDATE public.reservations SET status=COALESCE(r.status_before_delete,'confirmed'), deleted_at=NULL, deleted_by=NULL, delete_reason=NULL, status_before_delete=NULL WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_reservation_trash(_search text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL, _limit int DEFAULT 20, _offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid := public.active_organization_id(); q text := NULLIF(btrim(_search),''); rows jsonb; total int;
BEGIN
 IF org IS NULL OR NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 WITH base AS (
  SELECT r.id, r.guest_name, r.channel, r.check_in, r.check_out, r.deleted_at, r.delete_reason,
   r.deleted_at + interval '168 hours' AS purge_at, rm.number AS room, p.name AS property,
   pr.full_name AS deleter, public.reservation_trash_blocker(r.id) AS blocker
  FROM public.reservations r JOIN public.properties p ON p.id=r.property_id AND p.organization_id=org
  LEFT JOIN public.rooms rm ON rm.id=r.room_id LEFT JOIN public.profiles pr ON pr.id=r.deleted_by
  WHERE r.organization_id=org AND r.deleted_at IS NOT NULL
   AND (q IS NULL OR r.guest_name ILIKE '%'||q||'%' OR rm.number ILIKE '%'||q||'%' OR p.name ILIKE '%'||q||'%')
   AND (_from IS NULL OR (r.deleted_at AT TIME ZONE 'Europe/Berlin')::date >= _from)
   AND (_to IS NULL OR (r.deleted_at AT TIME ZONE 'Europe/Berlin')::date <= _to))
 SELECT (SELECT count(*) FROM base), coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.deleted_at DESC, b.id) FROM (SELECT * FROM base ORDER BY deleted_at DESC, id LIMIT LEAST(GREATEST(_limit,1),50) OFFSET GREATEST(_offset,0)) b),'[]'::jsonb)
 INTO total, rows;
 RETURN jsonb_build_object('total', total, 'rows', rows);
END $$;
REVOKE ALL ON FUNCTION public.list_reservation_trash(text,date,date,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_reservation_trash(text,date,date,int,int) TO authenticated;

-- Hourly server cleanup; _now exists only for controlled tests and is not callable by app users.
CREATE OR REPLACE FUNCTION public.purge_expired_reservation_trash(_now timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org record; item record; run_id uuid; result text; purged int; kept int; total_purged int := 0;
BEGIN
 FOR org IN SELECT id FROM public.organizations WHERE active LOOP
  purged := 0; kept := 0;
  INSERT INTO public.cron_executions(organization_id,job,status,started_at) VALUES(org.id,'purge_reservation_trash','running',now()) RETURNING id INTO run_id;
  BEGIN
   FOR item IN SELECT id FROM public.reservations WHERE organization_id=org.id AND deleted_at IS NOT NULL AND deleted_at <= _now - interval '168 hours' ORDER BY deleted_at LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    result := public._purge_trashed_reservation(item.id, _now - interval '168 hours');
    IF result='purged' THEN purged := purged+1; ELSIF result IN ('finance_history','linked_tasks') THEN kept := kept+1; END IF;
   END LOOP;
   UPDATE public.cron_executions SET status='success', finished_at=now(), detail=jsonb_build_object('purged',purged,'kept_with_history',kept) WHERE id=run_id;
  EXCEPTION WHEN OTHERS THEN
   UPDATE public.cron_executions SET status='error', finished_at=now(), detail=jsonb_build_object('code',SQLSTATE) WHERE id=run_id;
  END;
  total_purged := total_purged + purged;
 END LOOP;
 RETURN jsonb_build_object('purged', total_purged);
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_reservation_trash(timestamptz) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='purge-reservation-trash';
SELECT cron.schedule('purge-reservation-trash', '17 * * * *', $c$SELECT public.purge_expired_reservation_trash()$c$);