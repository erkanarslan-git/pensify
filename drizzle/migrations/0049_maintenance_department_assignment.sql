ALTER TABLE public.room_issues ADD COLUMN assigned_to uuid, ADD COLUMN assigned_by uuid, ADD COLUMN assigned_at timestamptz;
CREATE OR REPLACE FUNCTION public.maintenance_assignment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE manager boolean;
BEGIN
 IF TG_OP='INSERT' AND NEW.assigned_to IS NULL THEN NEW.assigned_by:=NULL; NEW.assigned_at:=NULL; RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN NEW.assigned_by:=OLD.assigned_by; NEW.assigned_at:=OLD.assigned_at; RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT public.is_organization_member(NEW.organization_id) OR NOT public.can_access_property(NEW.property_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NEW.status<>'open' THEN RAISE EXCEPTION 'assignment_locked'; END IF;
 manager:=public.is_org_admin(NEW.organization_id) OR public.has_organization_permission(NEW.organization_id,'manage_rooms') OR public.has_organization_permission(NEW.organization_id,'assign_cleaning');
 IF NOT manager THEN
  IF NOT public.has_department_assignment(NEW.organization_id,'maintenance',NULL) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND OLD.assigned_to IS NOT NULL AND NOT public.has_department_assignment(NEW.organization_id,'maintenance',OLD.assigned_to) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members m JOIN public.member_departments d ON d.member_id=m.id WHERE m.organization_id=NEW.organization_id AND d.organization_id=NEW.organization_id AND m.user_id=NEW.assigned_to AND m.active AND d.department='maintenance' AND d.is_worker) THEN RAISE EXCEPTION 'invalid_assignee' USING ERRCODE='42501'; END IF;
 IF NOT manager AND NEW.assigned_to IS NOT NULL AND NOT public.has_department_assignment(NEW.organization_id,'maintenance',NEW.assigned_to) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 NEW.assigned_by:=auth.uid(); NEW.assigned_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER room_issues_assignment_guard BEFORE INSERT OR UPDATE ON public.room_issues FOR EACH ROW EXECUTE FUNCTION public.maintenance_assignment_guard();
CREATE OR REPLACE FUNCTION public.assign_room_issue(_issue_id uuid,_user_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE i public.room_issues;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.room_issues WHERE id=_issue_id FOR UPDATE;
 IF i.id IS NULL OR i.organization_id IS DISTINCT FROM public.active_organization_id() OR NOT public.can_access_property(i.property_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF NOT (public.is_org_admin(i.organization_id) OR public.has_organization_permission(i.organization_id,'manage_rooms') OR public.has_organization_permission(i.organization_id,'assign_cleaning') OR public.has_department_assignment(i.organization_id,'maintenance',NULL)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF i.status<>'open' THEN RAISE EXCEPTION 'assignment_locked'; END IF;
 UPDATE public.room_issues SET assigned_to=_user_id WHERE id=i.id;
END $$;
REVOKE ALL ON FUNCTION public.assign_room_issue(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_room_issue(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.maintenance_board() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE org uuid:=public.active_organization_id(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('issues',coalesce(jsonb_agg(x),'[]'::jsonb)) INTO result FROM (
 SELECT i.id,i.room_id,r.number AS room_number,p.name AS property_name,i.property_id,i.category,i.description,i.status,i.created_at,i.reported_by,coalesce(reporter.full_name,'') AS reporter,i.assigned_to,i.assigned_at,coalesce(worker.full_name,'') AS assignee,coalesce(assigner.full_name,'') AS assigner,
 (public.can_access_property(i.property_id) AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning') OR (public.has_department_assignment(org,'maintenance',NULL) AND (i.assigned_to IS NULL OR public.has_department_assignment(org,'maintenance',i.assigned_to))))) AS can_assign
 FROM public.room_issues i JOIN public.rooms r ON r.id=i.room_id JOIN public.properties p ON p.id=i.property_id LEFT JOIN public.profiles reporter ON reporter.id=i.reported_by LEFT JOIN public.profiles worker ON worker.id=i.assigned_to LEFT JOIN public.profiles assigner ON assigner.id=i.assigned_by
 WHERE i.organization_id=org AND i.status='open' AND (i.reported_by=auth.uid() OR (public.can_access_property(i.property_id) AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning') OR public.has_department_assignment(org,'maintenance',NULL) OR i.assigned_to=auth.uid()))) ORDER BY i.created_at DESC
 ) x;
 RETURN result || jsonb_build_object('workers',coalesce((SELECT jsonb_agg(x) FROM (SELECT m.user_id,coalesce(pr.full_name,'') AS full_name FROM public.organization_members m JOIN public.member_departments d ON d.member_id=m.id LEFT JOIN public.profiles pr ON pr.id=m.user_id WHERE m.organization_id=org AND d.organization_id=org AND m.active AND d.department='maintenance' AND d.is_worker AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning') OR public.has_department_assignment(org,'maintenance',m.user_id)) ORDER BY pr.full_name) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.maintenance_board() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintenance_board() TO authenticated;