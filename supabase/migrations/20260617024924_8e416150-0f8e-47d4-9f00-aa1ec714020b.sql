
-- Lock down audit_logs direct inserts (only triggers write, as service_role)
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;

-- Pin search_path on attach_audit
CREATE OR REPLACE FUNCTION public.attach_audit(target regclass)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS audit_trg ON %s; CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();',
    target, target);
END $$;

-- Revoke EXECUTE on helper/definer functions from clients
REVOKE EXECUTE ON FUNCTION public.attach_audit(regclass) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit_log()      FROM PUBLIC, anon, authenticated;
-- Triggers fire regardless of EXECUTE grants; service_role retains access by default
