-- Reversible integration checks; no operational rows are retained.
BEGIN;
DO $$ DECLARE u uuid; org uuid; item uuid; n integer; attachment jsonb;
BEGIN
 SELECT user_id,organization_id INTO u,org FROM public.organization_members WHERE active AND role='owner' LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'test owner required'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 item:=public.save_general_todo(jsonb_build_object('title','Reversible repeat test','due_date','2026-10-23','recurrence','daily'));
 PERFORM public.general_todo_action(item,'complete'); PERFORM public.general_todo_action(item,'reopen'); PERFORM public.general_todo_action(item,'complete');
 SELECT count(*) INTO n FROM public.todos WHERE recurrence_root=item;
 IF n<>1 THEN RAISE EXCEPTION 'repeat duplicated'; END IF;
 PERFORM public.general_todo_action(item,'note','After completion');
 IF NOT EXISTS(SELECT 1 FROM public.todo_activity WHERE todo_id=item AND body='After completion') THEN RAISE EXCEPTION 'completed note missing'; END IF;
 attachment:=public.reserve_todo_attachment(item,'test.pdf',100,'application/pdf');
 IF NOT public.todo_attachment_access(attachment->>'path',true) THEN RAISE EXCEPTION 'own upload denied'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 IF public.can_read_todo(item) OR public.todo_attachment_access(attachment->>'path',false) THEN RAISE EXCEPTION 'foreign task visible'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM public.remove_todo_attachment((attachment->>'id')::uuid);
END $$;
ROLLBACK;