ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION public.require_reservation_cancellation_reason()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'cancelled' AND NULLIF(btrim(NEW.cancellation_reason), '') IS NULL THEN
    RAISE EXCEPTION 'cancellation_reason_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancellation_reason := left(btrim(NEW.cancellation_reason), 500);
    NEW.cancelled_at := now();
    NEW.cancelled_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reservations_cancellation_reason ON public.reservations;
CREATE TRIGGER reservations_cancellation_reason
BEFORE UPDATE ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.require_reservation_cancellation_reason();

CREATE OR REPLACE FUNCTION public.cancel_reservation(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NULLIF(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'cancellation_reason_required' USING ERRCODE = '23514';
  END IF;
  SELECT id, organization_id, property_id, status, deleted_at, check_out INTO r
    FROM public.reservations WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.has_organization_permission(r.organization_id, 'create_reservation')
     OR NOT public.can_access_property(r.property_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF r.check_out <= (now() AT TIME ZONE 'Europe/Berlin')::date
     AND NOT public.has_organization_permission(r.organization_id, 'create_past_reservation') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF r.status = 'cancelled' THEN RETURN; END IF;
  UPDATE public.reservations
     SET status = 'cancelled', cancellation_reason = left(btrim(_reason), 500),
         cancelled_at = now(), cancelled_by = auth.uid()
   WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.cancel_reservation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_reservation(_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NULLIF(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'delete_reason_required' USING ERRCODE = '23514';
  END IF;
  SELECT id, organization_id, property_id, status, deleted_at INTO r
    FROM public.reservations WHERE id = _id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF NOT public.has_organization_permission(r.organization_id, 'delete_reservation')
     OR NOT public.can_access_property(r.property_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.reservation_id = _id) THEN
    RAISE EXCEPTION 'invoice_history' USING ERRCODE = '23514';
  END IF;
  UPDATE public.reservations
     SET deleted_at = now(), deleted_by = auth.uid(), delete_reason = left(btrim(_reason), 500),
         cancellation_reason = left(btrim(_reason), 500), cancelled_at = now(), cancelled_by = auth.uid(),
         status_before_delete = status, status = 'cancelled'
   WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.reservation_trash_blocker(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM public.invoices WHERE reservation_id=_id)
    OR EXISTS(SELECT 1 FROM public.payments WHERE reservation_id=_id)
    OR EXISTS(SELECT 1 FROM public.payment_schedules WHERE reservation_id=_id)
    OR EXISTS(SELECT 1 FROM public.payment_receipts WHERE reservation_id=_id) THEN 'finance_history'
  WHEN EXISTS(SELECT 1 FROM public.todos WHERE reservation_id=_id) THEN 'linked_tasks'
  ELSE NULL END $$;

CREATE OR REPLACE FUNCTION public.purge_reservation(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid; result text;
BEGIN
 SELECT organization_id INTO org FROM public.reservations
  WHERE id=_id AND deleted_at IS NOT NULL AND deleted_at <= now() - interval '30 days';
 IF org IS NULL THEN RAISE EXCEPTION 'not_due' USING ERRCODE = '23514'; END IF;
 IF NOT public.is_org_admin(org) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 result := public._purge_trashed_reservation(_id, now() - interval '30 days');
 IF result <> 'purged' THEN RAISE EXCEPTION '%', result USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.restore_reservation(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
 SELECT id, organization_id, property_id, room_id, check_in, check_out, deleted_at, status_before_delete INTO r
  FROM public.reservations WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.deleted_at IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT public.is_org_admin(r.organization_id) OR NOT public.can_access_property(r.property_id) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.rooms WHERE id=r.room_id FOR UPDATE;
 IF COALESCE(r.status_before_delete,'confirmed') NOT IN ('cancelled','no_show') AND EXISTS(
  SELECT 1 FROM public.reservations x WHERE x.room_id=r.room_id AND x.id<>r.id AND x.deleted_at IS NULL
   AND x.status NOT IN ('cancelled','no_show')
   AND daterange(x.check_in,x.check_out,'[)') && daterange(r.check_in,r.check_out,'[)')) THEN
  RAISE EXCEPTION 'restore_overlap' USING ERRCODE='23514';
 END IF;
 UPDATE public.reservations
    SET status=COALESCE(r.status_before_delete,'confirmed'), deleted_at=NULL, deleted_by=NULL,
        delete_reason=NULL, status_before_delete=NULL, cancellation_reason=NULL,
        cancelled_at=NULL, cancelled_by=NULL
  WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_reservation_trash(_search text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL, _limit int DEFAULT 20, _offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid := public.active_organization_id(); q text := NULLIF(btrim(_search),''); rows jsonb; total int;
BEGIN
 IF org IS NULL OR NOT public.has_organization_permission(org, 'delete_reservation') THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 WITH base AS (
  SELECT r.id, r.guest_name, r.channel, r.check_in, r.check_out, r.deleted_at, r.delete_reason,
   r.deleted_at + interval '30 days' AS purge_at, rm.number AS room, p.name AS property,
   pr.full_name AS deleter, public.reservation_trash_blocker(r.id) AS blocker
  FROM public.reservations r JOIN public.properties p ON p.id=r.property_id AND p.organization_id=org
  LEFT JOIN public.rooms rm ON rm.id=r.room_id LEFT JOIN public.profiles pr ON pr.id=r.deleted_by
  WHERE r.organization_id=org AND r.deleted_at IS NOT NULL AND public.can_access_property(r.property_id)
   AND (q IS NULL OR r.guest_name ILIKE '%'||q||'%' OR rm.number ILIKE '%'||q||'%' OR p.name ILIKE '%'||q||'%')
   AND (_from IS NULL OR (r.deleted_at AT TIME ZONE 'Europe/Berlin')::date >= _from)
   AND (_to IS NULL OR (r.deleted_at AT TIME ZONE 'Europe/Berlin')::date <= _to))
 SELECT (SELECT count(*) FROM base), coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.deleted_at DESC, b.id)
   FROM (SELECT * FROM base ORDER BY deleted_at DESC, id LIMIT LEAST(GREATEST(_limit,1),50) OFFSET GREATEST(_offset,0)) b),'[]'::jsonb)
 INTO total, rows;
 RETURN jsonb_build_object('total', total, 'rows', rows);
END $$;

CREATE OR REPLACE FUNCTION public.purge_expired_reservation_trash(_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org record; item record; run_id uuid; result text; purged int; kept int; total_purged int := 0;
BEGIN
 FOR org IN SELECT id FROM public.organizations WHERE active LOOP
  purged := 0; kept := 0;
  INSERT INTO public.cron_executions(organization_id,job,status,started_at)
   VALUES(org.id,'purge_reservation_trash','running',now()) RETURNING id INTO run_id;
  BEGIN
   FOR item IN SELECT id FROM public.reservations
    WHERE organization_id=org.id AND deleted_at IS NOT NULL AND deleted_at <= _now - interval '30 days'
    ORDER BY deleted_at LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    result := public._purge_trashed_reservation(item.id, _now - interval '30 days');
    IF result='purged' THEN purged := purged+1;
    ELSIF result IN ('finance_history','linked_tasks') THEN kept := kept+1; END IF;
   END LOOP;
   UPDATE public.cron_executions SET status='success', finished_at=now(),
    detail=jsonb_build_object('purged',purged,'kept_with_history',kept) WHERE id=run_id;
  EXCEPTION WHEN OTHERS THEN
   UPDATE public.cron_executions SET status='error', finished_at=now(), detail=jsonb_build_object('code',SQLSTATE) WHERE id=run_id;
  END;
  total_purged := total_purged + purged;
 END LOOP;
 RETURN jsonb_build_object('purged', total_purged);
END $$;