-- ===== Role mapping helpers =====
CREATE OR REPLACE FUNCTION public.app_to_org_role(_r app_role) RETURNS org_role
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (CASE _r::text WHEN 'manager' THEN 'operations_manager' ELSE _r::text END)::org_role $$;

CREATE OR REPLACE FUNCTION public.org_to_app_role(_r org_role) RETURNS app_role
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (CASE _r::text WHEN 'operations_manager' THEN 'manager' WHEN 'property_manager' THEN 'manager' ELSE _r::text END)::app_role $$;

-- ===== One membership per organization/user =====
ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_organization_id_user_id_role_key;
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_org_user_key UNIQUE (organization_id, user_id);

-- ===== Stop legacy global-role sync (legacy table kept, read-only history) =====
DROP TRIGGER IF EXISTS user_roles_sync_org ON public.user_roles;
COMMENT ON TABLE public.user_roles IS 'DEPRECATED: legacy global roles. Used once as migration source; authorization uses organization_members.role';
COMMENT ON FUNCTION public.sync_org_membership() IS 'DEPRECATED: no longer attached';
COMMENT ON FUNCTION public.has_role(uuid, app_role) IS 'DEPRECATED: global roles must not authorize tenant data';

-- ===== Strict organization context (no fallback) =====
CREATE OR REPLACE FUNCTION public.default_organization_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(m.organization_id))[1] END
    FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id AND o.active
   WHERE m.user_id = auth.uid() AND m.active $$;

CREATE OR REPLACE FUNCTION public.active_organization_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.default_organization_id() $$;

CREATE OR REPLACE FUNCTION public.my_org_role(_org uuid DEFAULT NULL) RETURNS org_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id AND o.active
   WHERE m.user_id = auth.uid() AND m.active
     AND m.organization_id = COALESCE(_org, public.default_organization_id()) $$;

CREATE OR REPLACE FUNCTION public.my_app_roles() RETURNS app_role[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ARRAY[public.org_to_app_role(public.my_org_role())]::app_role[], ARRAY[]::app_role[])
   WHERE public.my_org_role() IS NOT NULL
  UNION ALL SELECT ARRAY[]::app_role[] WHERE public.my_org_role() IS NULL $$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_organization_role(_org, ARRAY['owner','admin']::org_role[]) $$;

-- ===== Property access: assignment required =====
CREATE OR REPLACE FUNCTION public.can_access_property(_property uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.properties p
    JOIN public.organization_members m ON m.organization_id = p.organization_id AND m.user_id = auth.uid() AND m.active
    JOIN public.organizations o ON o.id = m.organization_id AND o.active
    WHERE p.id = _property AND (
      m.role IN ('owner','admin','operations_manager')
      OR EXISTS (SELECT 1 FROM public.member_property_access a WHERE a.member_id = m.id AND a.property_id = p.id)
      OR (m.role = 'cleaner' AND EXISTS (
            SELECT 1 FROM public.cleaning_tasks t JOIN public.cleaners c ON c.id = t.cleaner_id
             WHERE t.property_id = p.id AND c.user_id = auth.uid() AND c.organization_id = p.organization_id))
    )) $$;

-- ===== Permission defaults no longer read legacy role names =====
CREATE OR REPLACE FUNCTION public.has_organization_permission(_org uuid, _permission text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role org_role; v_override boolean; v_defaults text[];
BEGIN
  v_role := public.my_org_role(_org);
  IF v_role IS NULL OR _org IS NULL THEN RETURN false; END IF;
  IF v_role = 'owner' THEN RETURN true; END IF;
  SELECT allowed INTO v_override FROM public.user_permissions
   WHERE user_id = auth.uid() AND permission = _permission AND organization_id = _org LIMIT 1;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;
  SELECT rp.allowed INTO v_override FROM public.role_permissions rp
   WHERE rp.organization_id = _org AND rp.permission = _permission
     AND public.app_to_org_role(rp.role) = v_role LIMIT 1;
  IF v_override IS NOT NULL THEN RETURN v_override; END IF;
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
  RETURN v_role::text = ANY(v_defaults);
END $$;

-- ===== Tenant-scoped unique keys =====
ALTER TABLE public.role_permissions DROP CONSTRAINT role_permissions_pkey;
ALTER TABLE public.role_permissions ADD PRIMARY KEY (organization_id, role, permission);
ALTER TABLE public.user_permissions DROP CONSTRAINT user_permissions_pkey;
ALTER TABLE public.user_permissions ADD PRIMARY KEY (organization_id, user_id, permission);
ALTER TABLE public.app_settings DROP CONSTRAINT app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (organization_id, key);
ALTER TABLE public.reservations DROP CONSTRAINT reservations_channel_room_external_key;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_org_channel_room_external_key UNIQUE (organization_id, channel, room_id, external_id);
DROP INDEX IF EXISTS public.channel_integrations_ical_url_uniq;
CREATE UNIQUE INDEX channel_integrations_org_ical_url_uniq ON public.channel_integrations (organization_id, ical_url) WHERE ical_url IS NOT NULL;

-- ===== Triggers: carry organization explicitly =====
CREATE OR REPLACE FUNCTION public.auto_create_cleaning_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_default_cleaner uuid; v_due timestamptz;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.cleaning_tasks ct WHERE ct.room_id = NEW.room_id AND ct.due_at::date = NEW.check_out) THEN RETURN NEW; END IF;
  SELECT default_cleaner_id INTO v_default_cleaner FROM public.rooms WHERE id = NEW.room_id;
  v_due := (NEW.check_out::timestamp + interval '11 hours') AT TIME ZONE 'UTC';
  INSERT INTO public.cleaning_tasks (organization_id, room_id, property_id, cleaner_id, due_at, status, photos_count)
  VALUES (NEW.organization_id, NEW.room_id, NEW.property_id, v_default_cleaner, v_due, 'pending', 0);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.write_audit_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_email text; v_id text; v_diff jsonb; v_org uuid; v_row jsonb;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_org := COALESCE(NULLIF(v_row->>'organization_id','')::uuid, public.default_organization_id());
  IF v_org IS NULL THEN RETURN COALESCE(NEW, OLD); END IF; -- no tenant context: cannot attribute
  BEGIN SELECT email INTO v_email FROM auth.users WHERE id = v_actor; EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  v_id := COALESCE(v_row->>'id','');
  IF TG_OP = 'DELETE' THEN v_diff := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'INSERT' THEN v_diff := jsonb_build_object('new', to_jsonb(NEW));
  ELSE v_diff := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)); END IF;
  INSERT INTO public.audit_logs(organization_id, actor_id, actor_email, entity, entity_id, action, diff)
  VALUES (v_org, v_actor, v_email, TG_TABLE_NAME, v_id, TG_OP, v_diff);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.enforce_past_reservation_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'UTC')::date; v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);
  IF public.is_org_admin(v_org) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.check_out <= v_today THEN RAISE EXCEPTION 'Vergangene Buchungen dürfen nur von Admin/Inhaber angelegt werden.' USING ERRCODE = 'insufficient_privilege'; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.check_out <= v_today OR NEW.check_out <= v_today THEN RAISE EXCEPTION 'Diese Buchung ist abgelaufen und kann nur von Admin/Inhaber bearbeitet werden.' USING ERRCODE = 'insufficient_privilege'; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.check_out <= v_today THEN RAISE EXCEPTION 'Abgelaufene Buchungen dürfen nur von Admin/Inhaber gelöscht werden.' USING ERRCODE = 'insufficient_privilege'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.protect_time_entries_payment_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_org_admin(OLD.organization_id) THEN RETURN NEW; END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
     OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR NEW.payment_period_start IS DISTINCT FROM OLD.payment_period_start
     OR NEW.payment_period_end IS DISTINCT FROM OLD.payment_period_end OR NEW.manual_override_at IS DISTINCT FROM OLD.manual_override_at
     OR NEW.manual_override_by IS DISTINCT FROM OLD.manual_override_by OR NEW.cleaner_id IS DISTINCT FROM OLD.cleaner_id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.clock_in_at IS DISTINCT FROM OLD.clock_in_at
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Cleaners cannot modify payment or admin fields' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

-- First user bootstraps the only organization as owner; everyone else gets no role.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, locale)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
          NEW.raw_user_meta_data->>'avatar_url', COALESCE(NEW.raw_user_meta_data->>'locale', 'de'))
  ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members) AND (SELECT count(*) FROM public.organizations) = 1 THEN
    SELECT id INTO v_org FROM public.organizations;
    INSERT INTO public.organization_members(organization_id, user_id, role) VALUES (v_org, NEW.id, 'owner');
  END IF;
  RETURN NEW;
END $$;

-- ===== Admin RPCs: scoped to caller's organization =====
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, full_name text, roles app_role[], created_at timestamptz, banned_until timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.default_organization_id();
BEGIN
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.full_name,
      COALESCE(ARRAY_AGG(public.org_to_app_role(m.role)) FILTER (WHERE m.role IS NOT NULL), ARRAY[]::app_role[]),
      u.created_at, u.banned_until
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.organization_members m ON m.user_id = u.id AND m.organization_id = v_org AND m.active
    WHERE m.id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.access_requests r WHERE r.user_id = u.id AND r.organization_id = v_org)
    GROUP BY u.id, u.email, p.full_name, u.created_at, u.banned_until
    ORDER BY u.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role app_role) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.default_organization_id(); v_new org_role := public.app_to_org_role(_role);
BEGIN
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_new = 'owner' AND NOT public.has_organization_role(v_org, ARRAY['owner']::org_role[]) THEN RAISE EXCEPTION 'only owner can grant owner'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = v_org AND user_id = _user_id AND role = 'owner' AND v_new <> 'owner')
     AND (SELECT count(*) FROM public.organization_members WHERE organization_id = v_org AND role = 'owner' AND active) <= 1 THEN
    RAISE EXCEPTION 'cannot remove last owner';
  END IF;
  INSERT INTO public.organization_members(organization_id, user_id, role, active) VALUES (v_org, _user_id, v_new, true)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(_user_id uuid, _role app_role) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.default_organization_id();
BEGIN
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.app_to_org_role(_role) = 'owner' AND (SELECT count(*) FROM public.organization_members WHERE organization_id = v_org AND role = 'owner' AND active) <= 1 THEN
    RAISE EXCEPTION 'cannot remove last owner';
  END IF;
  DELETE FROM public.organization_members
   WHERE organization_id = v_org AND user_id = _user_id AND public.org_to_app_role(role) = _role;
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_access_request(_request_id uuid, _grant_role app_role, _approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid; v_org uuid;
BEGIN
  SELECT user_id, organization_id INTO v_user, v_org FROM public.access_requests WHERE id = _request_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _approve THEN
    IF public.app_to_org_role(_grant_role) = 'owner' AND NOT public.has_organization_role(v_org, ARRAY['owner']::org_role[]) THEN RAISE EXCEPTION 'only owner can grant owner'; END IF;
    INSERT INTO public.organization_members(organization_id, user_id, role) VALUES (v_org, v_user, public.app_to_org_role(_grant_role))
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true;
    UPDATE public.access_requests SET status='granted', resolved_at=now(), resolved_by=auth.uid() WHERE id=_request_id;
  ELSE
    UPDATE public.access_requests SET status='denied', resolved_at=now(), resolved_by=auth.uid() WHERE id=_request_id;
  END IF;
END $$;

-- Access request: organization must be unambiguous (exactly one active organization), else fail closed.
CREATE OR REPLACE FUNCTION public.request_access(_message text, _role app_role) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF (SELECT count(*) FROM public.organizations WHERE active) <> 1 THEN RAISE EXCEPTION 'organization_required'; END IF;
  SELECT id INTO v_org FROM public.organizations WHERE active;
  INSERT INTO public.access_requests(organization_id, user_id, message, requested_role)
  VALUES (v_org, auth.uid(), left(_message, 1000), _role) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_link_cleaner(_cleaner_id uuid, _user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.cleaners WHERE id = _cleaner_id;
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id IS NOT NULL THEN
    UPDATE public.cleaners SET user_id = NULL WHERE user_id = _user_id AND id <> _cleaner_id AND organization_id = v_org;
    INSERT INTO public.organization_members(organization_id, user_id, role) VALUES (v_org, _user_id, 'cleaner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;
  UPDATE public.cleaners SET user_id = _user_id WHERE id = _cleaner_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_cleaner_rates() RETURNS TABLE(id uuid, hourly_rate numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.default_organization_id();
BEGIN
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT c.id, c.hourly_rate FROM public.cleaners c WHERE c.organization_id = v_org;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_property_qr_tokens() RETURNS TABLE(id uuid, qr_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid := public.default_organization_id();
BEGIN
  IF v_org IS NULL OR NOT public.has_organization_role(v_org, ARRAY['owner','admin','operations_manager']::org_role[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT p.id, p.qr_token FROM public.properties p WHERE p.organization_id = v_org;
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_property_qr(_id uuid)
RETURNS TABLE(id uuid, name text, address text, qr_token text, geofence_radius_m integer, latitude double precision, longitude double precision, city_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.properties p WHERE p.id = _id;
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT p.id, p.name, p.address, p.qr_token, p.geofence_radius_m, p.latitude, p.longitude, c.name
    FROM public.properties p LEFT JOIN public.cities c ON c.id = p.city_id WHERE p.id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_time_entry_paid(_entry_id uuid, _amount numeric, _period_start date, _period_end date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.time_entries WHERE id = _entry_id;
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.time_entries SET paid_at = now(), paid_by = auth.uid(), paid_amount = _amount,
    payment_period_start = _period_start, payment_period_end = _period_end WHERE id = _entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_my_clock_properties()
RETURNS TABLE(id uuid, name text, qr_token text, latitude double precision, longitude double precision, geofence_radius_m integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  RETURN QUERY SELECT p.id, p.name, p.qr_token, p.latitude, p.longitude, p.geofence_radius_m
    FROM public.properties p WHERE public.can_access_property(p.id) ORDER BY p.name;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_clock_property(_token text)
RETURNS TABLE(id uuid, name text, address text, latitude double precision, longitude double precision, geofence_radius_m integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  RETURN QUERY SELECT p.id, p.name, p.address, p.latitude, p.longitude, p.geofence_radius_m
    FROM public.properties p WHERE p.qr_token = _token AND public.is_organization_member(p.organization_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.request_access(text, app_role), public.my_app_roles(), public.my_org_role(uuid),
  public.active_organization_id(), public.is_org_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_access(text, app_role), public.my_app_roles(), public.my_org_role(uuid),
  public.active_organization_id(), public.is_org_admin(uuid) TO authenticated;

-- ===== Replace every global-role policy with row-organization role checks =====
DROP POLICY "Admins update requests" ON public.access_requests;
DROP POLICY "Users read own requests; admins read all" ON public.access_requests;
DROP POLICY "Users create own access requests" ON public.access_requests;
CREATE POLICY ar_read ON public.access_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_admin(organization_id));
CREATE POLICY ar_update ON public.access_requests FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY app_settings_admin_read ON public.app_settings;
DROP POLICY app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings FOR SELECT TO authenticated USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]));
CREATE POLICY app_settings_write ON public.app_settings FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY audit_logs_admins_read ON public.audit_logs;
CREATE POLICY audit_logs_admins_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));

DROP POLICY bookings_read_staff ON public.bookings;
DROP POLICY bookings_write_staff ON public.bookings;
CREATE POLICY bookings_staff ON public.bookings FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception']::org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception']::org_role[]));

DROP POLICY channel_integrations_admin ON public.channel_integrations;
CREATE POLICY channel_integrations_admin ON public.channel_integrations FOR ALL TO authenticated
  USING (public.has_organization_permission(organization_id, 'manage_integrations')) WITH CHECK (public.has_organization_permission(organization_id, 'manage_integrations'));

DROP POLICY cities_write ON public.cities;
CREATE POLICY cities_write ON public.cities FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY cleaners_admin_all ON public.cleaners;
CREATE POLICY cleaners_admin_all ON public.cleaners FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY cleaners_manager_read ON public.cleaners FOR SELECT TO authenticated USING (public.has_organization_role(organization_id, ARRAY['operations_manager','property_manager']::org_role[]));

DROP POLICY cleaning_tasks_admin ON public.cleaning_tasks;
CREATE POLICY cleaning_tasks_admin ON public.cleaning_tasks FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager']::org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager']::org_role[]));

DROP POLICY "owners and managers manage conflicts" ON public.conflict_alerts;
CREATE POLICY conflicts_manage ON public.conflict_alerts FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]));

DROP POLICY "Admins read cron executions" ON public.cron_executions;
CREATE POLICY cron_exec_read ON public.cron_executions FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));

DROP POLICY dispatch_msg_admin_all ON public.dispatch_messages;
CREATE POLICY dispatch_msg_admin_all ON public.dispatch_messages FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]));
DROP POLICY dispatch_replies_admin_all ON public.dispatch_replies;
CREATE POLICY dispatch_replies_admin_all ON public.dispatch_replies FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]));

DROP POLICY profiles_admin_select_all ON public.profiles;
CREATE POLICY profiles_org_admin_read ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = profiles.id AND public.is_org_admin(m.organization_id))
  OR EXISTS (SELECT 1 FROM public.access_requests r WHERE r.user_id = profiles.id AND public.is_org_admin(r.organization_id)));

DROP POLICY properties_write ON public.properties;
CREATE POLICY properties_write ON public.properties FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY reservations_read ON public.reservations;
DROP POLICY reservations_write ON public.reservations;
CREATE POLICY reservations_staff ON public.reservations FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception']::org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception']::org_role[]));

DROP POLICY "Admins manage role permissions" ON public.role_permissions;
DROP POLICY "Users read perms for their own roles" ON public.role_permissions;
CREATE POLICY role_perms_admin ON public.role_permissions FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY role_perms_own_read ON public.role_permissions FOR SELECT TO authenticated USING (public.app_to_org_role(role) = public.my_org_role(organization_id));

DROP POLICY rooms_cleaner_read ON public.rooms;
DROP POLICY rooms_read ON public.rooms;
DROP POLICY rooms_write ON public.rooms;
CREATE POLICY rooms_staff_read ON public.rooms FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager','property_manager','reception']::org_role[]));
CREATE POLICY rooms_cleaner_read ON public.rooms FOR SELECT TO authenticated USING (
  public.has_organization_role(organization_id, ARRAY['cleaner']::org_role[]) AND EXISTS (
    SELECT 1 FROM public.cleaning_tasks ct JOIN public.cleaners c ON c.id = ct.cleaner_id WHERE ct.room_id = rooms.id AND c.user_id = auth.uid()));
CREATE POLICY rooms_write ON public.rooms FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY "owners and managers read sync_jobs" ON public.sync_jobs;
DROP POLICY "owners and managers write sync_jobs" ON public.sync_jobs;
CREATE POLICY sync_jobs_manage ON public.sync_jobs FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]))
  WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner','admin','operations_manager']::org_role[]));

DROP POLICY time_entries_admin ON public.time_entries;
CREATE POLICY time_entries_admin ON public.time_entries FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY "Admins manage user permissions" ON public.user_permissions;
DROP POLICY "Users read own overrides; admins read all" ON public.user_permissions;
CREATE POLICY user_perms_admin ON public.user_permissions FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY user_perms_own_read ON public.user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY user_roles_admin_select_all ON public.user_roles;

DROP POLICY "members read org members" ON public.organization_members;
CREATE POLICY members_read ON public.organization_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_admin(organization_id));
