-- Permission check enforced server-side (mirrors src/lib/permissions.ts defaults)
CREATE OR REPLACE FUNCTION public.has_organization_permission(_org uuid, _permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_override boolean;
  v_roles text[];
  v_defaults text[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_organization_member(_org) THEN RETURN false; END IF;
  SELECT array_agg(role::text) INTO v_roles FROM public.organization_members
    WHERE organization_id = _org AND user_id = v_uid AND active;
  IF 'owner' = ANY(v_roles) THEN RETURN true; END IF;
  SELECT allowed INTO v_override FROM public.user_permissions
    WHERE user_id = v_uid AND permission = _permission AND organization_id = _org LIMIT 1;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;
  IF EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.organization_id = _org AND rp.permission = _permission
       AND rp.allowed AND (CASE rp.role::text WHEN 'manager' THEN 'operations_manager' ELSE rp.role::text END) = ANY(v_roles)) THEN
    RETURN true;
  END IF;
  v_defaults := CASE _permission
    WHEN 'view_calendar' THEN ARRAY['admin','operations_manager','property_manager','reception','cleaner']
    WHEN 'create_reservation' THEN ARRAY['admin','operations_manager','property_manager','reception']
    WHEN 'create_past_reservation' THEN ARRAY['admin']
    WHEN 'delete_reservation' THEN ARRAY['admin']
    WHEN 'manage_rooms' THEN ARRAY['admin']
    WHEN 'assign_cleaning' THEN ARRAY['admin','operations_manager','property_manager']
    WHEN 'do_cleaning' THEN ARRAY['admin','operations_manager','cleaner']
    WHEN 'view_finance' THEN ARRAY['admin','operations_manager']
    WHEN 'pay_cleaners' THEN ARRAY['admin']
    WHEN 'manage_team' THEN ARRAY['admin']
    WHEN 'manage_settings' THEN ARRAY['admin']
    WHEN 'manage_integrations' THEN ARRAY['admin']
    ELSE ARRAY[]::text[] END;
  RETURN v_roles && v_defaults;
END $$;
REVOKE EXECUTE ON FUNCTION public.has_organization_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_organization_permission(uuid, text) TO authenticated, service_role;

-- Tenant isolation: RESTRICTIVE policies are ANDed with the existing role policies.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['properties','rooms','cleaners','bookings','reservations','cleaning_tasks','time_entries',
    'channel_integrations','sync_jobs','conflict_alerts','audit_logs','app_settings','role_permissions','user_permissions',
    'dispatch_messages','dispatch_replies','cron_executions','cities']
  LOOP
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_organization_member(organization_id)) WITH CHECK (public.is_organization_member(organization_id))', t);
  END LOOP;
END $$;

-- Users without membership must still be able to file/read their own access request
CREATE POLICY tenant_isolation ON public.access_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_organization_member(organization_id))
  WITH CHECK (user_id = auth.uid() OR public.is_organization_member(organization_id));

-- Property-level access (property_manager / assigned reception)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rooms','reservations','cleaning_tasks','channel_integrations','conflict_alerts']
  LOOP
    EXECUTE format('CREATE POLICY property_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (property_id IS NULL OR public.can_access_property(property_id)) WITH CHECK (property_id IS NULL OR public.can_access_property(property_id))', t);
  END LOOP;
END $$;
CREATE POLICY property_access ON public.properties AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_property(id) OR public.has_organization_role(organization_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin']::public.org_role[]));

-- Cross-table consistency: child rows must share the property's organization
CREATE OR REPLACE FUNCTION public.enforce_same_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  IF NEW.property_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.properties WHERE id = NEW.property_id;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'organization mismatch' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rooms','reservations','cleaning_tasks','time_entries','channel_integrations']
  LOOP
    EXECUTE format('CREATE TRIGGER enforce_same_org BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_same_organization()', t);
  END LOOP;
END $$;