-- Structural authorization assertions; read-only and safe on a live database.
SELECT
  NOT has_table_privilege('authenticated','public.payments','DELETE') AS cannot_delete_history,
  NOT has_table_privilege('authenticated','public.payments','UPDATE') AS cannot_directly_rewrite_payments,
  NOT has_function_privilege('anon','public.reverse_manual_payment(uuid,text)','EXECUTE') AS anonymous_reversal_denied,
  NOT has_function_privilege('anon','public.save_reservation_payer_ibans(uuid,text[])','EXECUTE') AS anonymous_payer_update_denied,
  pg_get_functiondef('public.can_finance_action(uuid,uuid,text)'::regprocedure) LIKE '%active_organization_id%' AS finance_active_org_scoped,
  pg_get_functiondef('public.can_finance_action(uuid,uuid,text)'::regprocedure) LIKE '%can_access_property%' AS finance_property_scoped,
  pg_get_functiondef('public.my_report_teams()'::regprocedure) LIKE '%m.role=''owner''%' AS report_owner_only,
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='staff record payments' AND with_check LIKE '%collect_payments%') AS separate_collection_permission,
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_schedules' AND policyname='staff write schedules' AND with_check LIKE '%manage_payment_plans%') AS separate_plan_permission,
  NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('bank_connections','bank_accounts','bank_settings') AND cmd='SELECT' AND qual NOT LIKE '%active_organization_id%') AS bank_active_org_scoped;