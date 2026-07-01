
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Attach audit trigger to permission/role tables so all user-management actions are logged
SELECT public.attach_audit('public.user_roles');
SELECT public.attach_audit('public.role_permissions');
SELECT public.attach_audit('public.user_permissions');
SELECT public.attach_audit('public.access_requests');
SELECT public.attach_audit('public.app_settings');

-- Daily purge of audit logs older than 14 days
DO $$
BEGIN
  PERFORM cron.unschedule('purge-audit-logs-14d');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-audit-logs-14d',
  '15 3 * * *',
  $$ DELETE FROM public.audit_logs WHERE created_at < now() - interval '14 days'; $$
);
