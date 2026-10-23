-- Assigned maintenance workers must see and resolve their own issues even without location access.
DROP POLICY IF EXISTS "read room issues" ON public.room_issues;
CREATE POLICY "read room issues" ON public.room_issues FOR SELECT TO authenticated
USING (public.is_organization_member(organization_id) AND (public.can_access_property(property_id) OR reported_by = auth.uid() OR assigned_to = auth.uid()));

CREATE OR REPLACE FUNCTION public.maintenance_board()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE org uuid:=public.active_organization_id(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('issues',coalesce(jsonb_agg(x),'[]'::jsonb)) INTO result FROM (
 SELECT i.id,i.room_id,r.number AS room_number,p.name AS property_name,i.property_id,i.category,i.description,i.status,i.created_at,i.reported_by,coalesce(reporter.full_name,'') AS reporter,i.assigned_to,i.assigned_at,coalesce(worker.full_name,'') AS assignee,coalesce(assigner.full_name,'') AS assigner,
 (public.can_access_property(i.property_id) AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning') OR (public.has_department_assignment(org,'maintenance',NULL) AND (i.assigned_to IS NULL OR public.has_department_assignment(org,'maintenance',i.assigned_to))))) AS can_assign,
 (i.assigned_to=auth.uid() OR (public.can_access_property(i.property_id) AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning')))) AS can_resolve
 FROM public.room_issues i JOIN public.rooms r ON r.id=i.room_id JOIN public.properties p ON p.id=i.property_id LEFT JOIN public.profiles reporter ON reporter.id=i.reported_by LEFT JOIN public.profiles worker ON worker.id=i.assigned_to LEFT JOIN public.profiles assigner ON assigner.id=i.assigned_by
 WHERE i.organization_id=org AND i.status='open' AND (i.reported_by=auth.uid() OR i.assigned_to=auth.uid() OR (public.can_access_property(i.property_id) AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning') OR public.has_department_assignment(org,'maintenance',NULL)))) ORDER BY i.created_at DESC
 ) x;
 RETURN result || jsonb_build_object('workers',coalesce((SELECT jsonb_agg(x) FROM (SELECT m.user_id,coalesce(pr.full_name,'') AS full_name FROM public.organization_members m JOIN public.member_departments d ON d.member_id=m.id LEFT JOIN public.profiles pr ON pr.id=m.user_id WHERE m.organization_id=org AND d.organization_id=org AND m.active AND d.department='maintenance' AND d.is_worker AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning') OR public.has_department_assignment(org,'maintenance',m.user_id)) ORDER BY pr.full_name) x),'[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.resolve_room_issue(_issue_id uuid, _note text DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE org uuid:=public.active_organization_id(); i public.room_issues;
BEGIN
 IF auth.uid() IS NULL OR org IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.room_issues WHERE id=_issue_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 IF i.status<>'open' THEN RETURN; END IF;
 IF NOT (i.assigned_to=auth.uid() OR (public.can_access_property(i.property_id) AND (public.is_org_admin(org) OR public.has_organization_permission(org,'manage_rooms') OR public.has_organization_permission(org,'assign_cleaning')))) THEN
   RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.room_issues SET status='resolved', resolution_note=nullif(btrim(coalesce(_note,'')),''), resolved_by=auth.uid(), resolved_at=now(), updated_at=now() WHERE id=i.id;
END $function$;
REVOKE ALL ON FUNCTION public.resolve_room_issue(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_room_issue(uuid,text) TO authenticated;