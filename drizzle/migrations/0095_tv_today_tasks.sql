ALTER FUNCTION public.tv_snapshot_v3(text) RENAME TO tv_snapshot_v3_rooms;
REVOKE ALL ON FUNCTION public.tv_snapshot_v3_rooms(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.tv_snapshot_v3(_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE result jsonb; org uuid; d date := (now() AT TIME ZONE 'Europe/Berlin')::date; today jsonb;
BEGIN
 result:=public.tv_snapshot_v3_rooms(_token);
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT organization_id INTO org FROM public.tv_displays WHERE token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex') AND revoked_at IS NULL;
 IF org IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object(
  'cleaningTotal',(SELECT count(*)::int FROM public.cleaning_tasks WHERE organization_id=org AND (due_at AT TIME ZONE 'Europe/Berlin')::date=d),
  'cleaningDone',(SELECT count(*)::int FROM public.cleaning_tasks WHERE organization_id=org AND (due_at AT TIME ZONE 'Europe/Berlin')::date=d AND status='completed'),
  'todosTotal',(SELECT count(*)::int FROM public.todos WHERE organization_id=org AND archived_at IS NULL AND coalesce((due_at AT TIME ZONE 'Europe/Berlin')::date,due_date)=d),
  'todosDone',(SELECT count(*)::int FROM public.todos WHERE organization_id=org AND archived_at IS NULL AND coalesce((due_at AT TIME ZONE 'Europe/Berlin')::date,due_date)=d AND done),
  'issuesOpen',(SELECT count(*)::int FROM public.room_issues WHERE organization_id=org AND status<>'resolved'),
  'issuesResolved',(SELECT count(*)::int FROM public.room_issues WHERE organization_id=org AND status='resolved' AND (resolved_at AT TIME ZONE 'Europe/Berlin')::date=d)
 ) INTO today;
 RETURN result||jsonb_build_object('today',today);
END $$;
REVOKE ALL ON FUNCTION public.tv_snapshot_v3(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_snapshot_v3(text) TO anon, authenticated, service_role;