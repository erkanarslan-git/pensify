DO $$ DECLARE fn regprocedure; definition text; BEGIN
 FOREACH fn IN ARRAY ARRAY['public.transition_cleaning_task(uuid,public.cleaning_status)'::regprocedure,'public.review_cleaning_task(uuid,boolean,text)'::regprocedure] LOOP
 SELECT pg_get_functiondef(fn) INTO definition;
 definition:=replace(definition,'UPDATE public.cleaning_tasks','PERFORM set_config(''app.cleaning_transition'',''authorized'',true); UPDATE public.cleaning_tasks');
 EXECUTE definition;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.guard_cleaning_inspection_write() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.inspection_state IS DISTINCT FROM OLD.inspection_state OR NEW.inspected_by IS DISTINCT FROM OLD.inspected_by OR NEW.inspected_at IS DISTINCT FROM OLD.inspected_at OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) AND current_setting('app.cleaning_transition',true) IS DISTINCT FROM 'authorized' THEN RAISE EXCEPTION 'use_cleaning_transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cleaning_inspection_write_guard BEFORE UPDATE ON public.cleaning_tasks FOR EACH ROW EXECUTE FUNCTION public.guard_cleaning_inspection_write();