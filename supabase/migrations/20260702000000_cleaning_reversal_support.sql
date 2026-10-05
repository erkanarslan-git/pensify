-- Update transition_cleaning_task to support reversals and fix room status mapping
CREATE OR REPLACE FUNCTION public.transition_cleaning_task(_task_id uuid, _to cleaning_status)
RETURNS cleaning_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE t record; v_manager boolean; v_assigned boolean; v_ok boolean; v_room room_status;
BEGIN
  SELECT * INTO t FROM public.cleaning_tasks WHERE id = _task_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Aufgabe nicht gefunden'; END IF;
  IF t.status = _to THEN RETURN _to; END IF;

  IF auth.uid() IS NULL THEN
    IF coalesce(auth.role(), current_user) NOT IN ('service_role', 'postgres') THEN RAISE EXCEPTION 'unauthenticated'; END IF;
    v_manager := false; v_assigned := true; -- trusted server acts as assigned cleaner
  ELSE
    v_manager := public.has_organization_permission(t.organization_id, 'assign_cleaning');
    v_assigned := EXISTS (SELECT 1 FROM public.cleaners c WHERE c.id = t.cleaner_id AND c.user_id = auth.uid())
                  AND public.has_organization_permission(t.organization_id, 'do_cleaning');
    IF NOT v_manager AND NOT v_assigned THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  -- Extended transitions for reversal support
  v_ok := v_manager OR (t.status::text, _to::text) IN (
    -- Forward transitions
    ('pending','accepted'), ('pending','in_progress'), ('pending','problem'),
    ('accepted','in_progress'), ('accepted','problem'),
    ('in_progress','completed'), ('in_progress','problem'),
    ('problem','in_progress'),
    -- Safe reversal transitions for cleaners
    ('accepted','pending'),
    ('in_progress','accepted'),
    ('completed','in_progress'),
    ('problem','accepted')
  );
  
  IF NOT v_ok THEN RAISE EXCEPTION 'Statuswechsel % → % nicht erlaubt', t.status, _to; END IF;

  UPDATE public.cleaning_tasks
     SET status = _to, 
         completed_at = CASE WHEN _to = 'completed' THEN now() ELSE NULL END
   WHERE id = t.id;

  -- Room status mapping (fixed to include 'accepted' and handle reversals)
  v_room := CASE _to 
              WHEN 'in_progress' THEN 'cleaning_in_progress'::room_status
              WHEN 'completed' THEN 'cleaned'::room_status
              WHEN 'problem' THEN 'maintenance'::room_status
              WHEN 'pending', 'accepted' THEN 'cleaning_required'::room_status 
            END;
            
  IF v_room IS NOT NULL THEN 
    UPDATE public.rooms SET status = v_room WHERE id = t.room_id; 
  END IF;
  
  RETURN _to;
END $$;
