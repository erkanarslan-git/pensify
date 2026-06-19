
-- Fix 1: Restrict rooms SELECT so cleaners cannot read iCal feed tokens / room metadata.
-- Cleaners get room access via cleaning_tasks/time_entries which join rooms server-side.
DROP POLICY IF EXISTS rooms_read ON public.rooms;
CREATE POLICY rooms_read ON public.rooms
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- Fix 2: Restrict Supabase Realtime channel subscriptions so only privileged roles
-- can receive broadcast row changes for reservations, sync_jobs, and conflict_alerts
-- (which include guest PII).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Privileged roles can read realtime messages" ON realtime.messages;
CREATE POLICY "Privileged roles can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

DROP POLICY IF EXISTS "Privileged roles can send realtime messages" ON realtime.messages;
CREATE POLICY "Privileged roles can send realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);
