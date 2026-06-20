DROP POLICY IF EXISTS "Authenticated can read role permissions" ON public.role_permissions;

CREATE POLICY "Users read perms for their own roles"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = role_permissions.role
    )
  );

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.set_updated_at()',
    'public.handle_new_user()',
    'public.write_audit_log()',
    'public.attach_audit(regclass)',
    'public.validate_reservation_dates()',
    'public.enforce_past_reservation_policy()',
    'public.auto_create_cleaning_task()',
    'public.protect_time_entries_payment_fields()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;