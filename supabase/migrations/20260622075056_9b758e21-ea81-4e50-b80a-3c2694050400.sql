
-- 1) cleaners.hourly_rate — column-level hide from non-admin roles
REVOKE SELECT (hourly_rate) ON public.cleaners FROM authenticated;
REVOKE SELECT (hourly_rate) ON public.cleaners FROM anon;
REVOKE UPDATE (hourly_rate) ON public.cleaners FROM authenticated;
REVOKE UPDATE (hourly_rate) ON public.cleaners FROM anon;
REVOKE INSERT (hourly_rate) ON public.cleaners FROM authenticated;
REVOKE INSERT (hourly_rate) ON public.cleaners FROM anon;

-- 2) time_entries — column-level UPDATE revoke for payment/admin fields (defense-in-depth)
REVOKE UPDATE (
  paid_at, paid_by, paid_amount,
  payment_period_start, payment_period_end,
  manual_override_at, manual_override_by,
  cleaner_id, property_id, clock_in_at
) ON public.time_entries FROM authenticated;
REVOKE UPDATE (
  paid_at, paid_by, paid_amount,
  payment_period_start, payment_period_end,
  manual_override_at, manual_override_by,
  cleaner_id, property_id, clock_in_at
) ON public.time_entries FROM anon;
GRANT ALL ON public.time_entries TO service_role;

-- 3) Realtime — limit subscription delivery to staff roles only
DO $$ BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "staff_realtime_read" ON realtime.messages';
  EXECUTE $p$CREATE POLICY "staff_realtime_read" ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      public.has_role(auth.uid(),'owner')
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'manager')
      OR public.has_role(auth.uid(),'reception')
    )$p$;
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
