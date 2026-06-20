DROP POLICY IF EXISTS time_entries_self_update ON public.time_entries;

CREATE POLICY time_entries_self_update
ON public.time_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.cleaners c
    WHERE c.id = time_entries.cleaner_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.cleaners c
    WHERE c.id = time_entries.cleaner_id
      AND c.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS protect_time_entries_payment_fields_trg ON public.time_entries;

CREATE TRIGGER protect_time_entries_payment_fields_trg
BEFORE UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.protect_time_entries_payment_fields();