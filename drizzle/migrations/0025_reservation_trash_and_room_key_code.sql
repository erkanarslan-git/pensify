ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS status_before_delete reservation_status;
CREATE INDEX IF NOT EXISTS reservations_deleted_idx ON public.reservations(organization_id, deleted_at) WHERE deleted_at IS NOT NULL;

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS key_code text;

-- Deleted reservations are visible only to org owners/admins.
DROP POLICY IF EXISTS reservations_hide_deleted ON public.reservations;
CREATE POLICY reservations_hide_deleted ON public.reservations AS RESTRICTIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION public.soft_delete_reservation(_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT id, organization_id, property_id, status, deleted_at INTO r FROM public.reservations WHERE id = _id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF NOT public.has_organization_role(r.organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception']::org_role[])
     OR NOT public.can_access_property(r.property_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reservations
     SET deleted_at = now(), deleted_by = auth.uid(), delete_reason = NULLIF(btrim(_reason), ''),
         status_before_delete = status, status = 'cancelled'
   WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_reservation(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT id, organization_id, deleted_at, status_before_delete INTO r FROM public.reservations WHERE id = _id;
  IF r.id IS NULL OR r.deleted_at IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_org_admin(r.organization_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.reservations
     SET status = COALESCE(r.status_before_delete, 'confirmed'), deleted_at = NULL, deleted_by = NULL,
         delete_reason = NULL, status_before_delete = NULL
   WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.purge_reservation(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT id, organization_id, deleted_at INTO r FROM public.reservations WHERE id = _id;
  IF r.id IS NULL OR r.deleted_at IS NULL THEN RAISE EXCEPTION 'not_in_trash'; END IF;
  IF NOT public.is_org_admin(r.organization_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.reservations WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.soft_delete_reservation(uuid, text), public.restore_reservation(uuid), public.purge_reservation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_reservation(uuid, text), public.restore_reservation(uuid), public.purge_reservation(uuid) TO authenticated;
GRANT SELECT (deleted_at, deleted_by, delete_reason, status_before_delete) ON public.reservations TO authenticated;
GRANT SELECT (key_code), UPDATE (key_code) ON public.rooms TO authenticated;