ALTER TABLE public.push_tokens ADD COLUMN locale text NOT NULL DEFAULT 'de';
CREATE TABLE public.morning_push_deliveries (
 organization_id uuid NOT NULL, user_id uuid NOT NULL, day date NOT NULL,
 status text NOT NULL DEFAULT 'claimed', sent_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 PRIMARY KEY(organization_id,user_id,day)
);
GRANT ALL ON public.morning_push_deliveries TO service_role;
ALTER TABLE public.morning_push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.morning_task_counts(_day date)
RETURNS TABLE(organization_id uuid,user_id uuid,today_count bigint,overdue_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH tasks AS (
 SELECT t.organization_id,t.assigned_to AS user_id,coalesce((t.due_at AT TIME ZONE 'Europe/Berlin')::date,t.due_date) AS due_day
 FROM public.todos t WHERE NOT t.done AND t.archived_at IS NULL AND t.assigned_to IS NOT NULL
 UNION ALL
 SELECT t.organization_id,c.user_id,(t.due_at AT TIME ZONE 'Europe/Berlin')::date
 FROM public.cleaning_tasks t JOIN public.cleaners c ON c.id=t.cleaner_id AND c.organization_id=t.organization_id AND c.active
 WHERE t.status IN ('pending','accepted','in_progress','problem') AND c.user_id IS NOT NULL
 ) SELECT t.organization_id,t.user_id,count(*) FILTER(WHERE due_day=_day),count(*) FILTER(WHERE due_day<_day)
 FROM tasks t JOIN public.organizations o ON o.id=t.organization_id AND o.active
 JOIN public.organization_members m ON m.organization_id=t.organization_id AND m.user_id=t.user_id AND m.active
 WHERE due_day<=_day AND EXISTS(SELECT 1 FROM public.push_tokens p WHERE p.organization_id=t.organization_id AND p.user_id=t.user_id)
 GROUP BY t.organization_id,t.user_id;
$$;
REVOKE ALL ON FUNCTION public.morning_task_counts(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morning_task_counts(date) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_morning_push(_org uuid,_user uuid,_day date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.morning_push_deliveries(organization_id,user_id,day) VALUES(_org,_user,_day) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_morning_push(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_morning_push(uuid,uuid,date) TO service_role;