DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.has_role(uuid, public.app_role)',
    'public.admin_list_users()',
    'public.admin_set_role(uuid, public.app_role)',
    'public.admin_remove_role(uuid, public.app_role)',
    'public.admin_link_cleaner(uuid, uuid)',
    'public.admin_resolve_access_request(uuid, public.app_role, boolean)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;