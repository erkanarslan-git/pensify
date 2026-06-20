
REVOKE SELECT (hourly_rate) ON public.cleaners FROM authenticated;

DROP POLICY IF EXISTS rooms_cleaner_read ON public.rooms;
CREATE POLICY rooms_cleaner_read ON public.rooms
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'cleaner'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.cleaning_tasks ct
      JOIN public.cleaners c ON c.id = ct.cleaner_id
      WHERE ct.room_id = rooms.id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS time_entries_self_update ON public.time_entries;
CREATE POLICY time_entries_self_update ON public.time_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = time_entries.cleaner_id AND c.user_id = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.time_entries old
      WHERE old.id = time_entries.id
        AND (
          old.paid_at IS DISTINCT FROM time_entries.paid_at
          OR old.paid_by IS DISTINCT FROM time_entries.paid_by
          OR old.paid_amount IS DISTINCT FROM time_entries.paid_amount
          OR old.payment_period_start IS DISTINCT FROM time_entries.payment_period_start
          OR old.payment_period_end IS DISTINCT FROM time_entries.payment_period_end
          OR old.manual_override_at IS DISTINCT FROM time_entries.manual_override_at
          OR old.manual_override_by IS DISTINCT FROM time_entries.manual_override_by
          OR old.cleaner_id IS DISTINCT FROM time_entries.cleaner_id
          OR old.property_id IS DISTINCT FROM time_entries.property_id
          OR old.clock_in_at IS DISTINCT FROM time_entries.clock_in_at
        )
    )
  );

DROP POLICY IF EXISTS "Privileged roles can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Privileged roles can send realtime messages" ON realtime.messages;
