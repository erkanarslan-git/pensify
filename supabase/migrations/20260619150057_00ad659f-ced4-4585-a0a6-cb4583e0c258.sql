
-- 1) Update reservations RLS to include 'reception'
DROP POLICY IF EXISTS "reservations_read" ON public.reservations;
CREATE POLICY "reservations_read" ON public.reservations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'reception')
  );

DROP POLICY IF EXISTS "reservations_write" ON public.reservations;
CREATE POLICY "reservations_write" ON public.reservations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'reception')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'reception')
  );

-- 2) Past-date protection trigger (database-level lock for reception)
CREATE OR REPLACE FUNCTION public.enforce_past_reservation_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_priv boolean;
BEGIN
  -- Privileged: owner, admin, manager can touch past dates
  v_priv := public.has_role(auth.uid(),'owner')
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'manager');
  IF v_priv THEN
    RETURN NEW;
  END IF;

  -- Below: reception (or anyone non-privileged with write access)
  IF TG_OP = 'INSERT' THEN
    IF NEW.check_in < v_today THEN
      RAISE EXCEPTION 'Vergangene Buchungen dürfen nur von Manager/Admin/Inhaber angelegt werden.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Block if either old or new check_in is in the past, or check_out date crosses past
    IF OLD.check_in < v_today OR NEW.check_in < v_today THEN
      RAISE EXCEPTION 'Vergangene Buchungen dürfen nur von Manager/Admin/Inhaber bearbeitet werden.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.check_in < v_today THEN
      RAISE EXCEPTION 'Vergangene Buchungen dürfen nur von Manager/Admin/Inhaber gelöscht werden.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS reservations_enforce_past ON public.reservations;
CREATE TRIGGER reservations_enforce_past
  BEFORE INSERT OR UPDATE OR DELETE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_past_reservation_policy();

-- 3) Seed role_permissions: reception gets view_calendar + create_reservation defaults,
--    Add new 'create_past_reservation' permission for owner/admin/manager.
INSERT INTO public.role_permissions (role, permission, allowed) VALUES
  ('reception', 'view_calendar', true),
  ('reception', 'create_reservation', true),
  ('reception', 'do_cleaning', false),
  ('reception', 'view_finance', false),
  ('reception', 'manage_team', false),
  ('reception', 'manage_settings', false),
  ('reception', 'manage_rooms', false),
  ('reception', 'manage_integrations', false),
  ('reception', 'assign_cleaning', false),
  ('reception', 'delete_reservation', false),
  ('reception', 'pay_cleaners', false),
  ('reception', 'create_past_reservation', false),
  ('owner', 'create_past_reservation', true),
  ('admin', 'create_past_reservation', true),
  ('manager', 'create_past_reservation', true),
  ('cleaner', 'create_past_reservation', false)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now();
