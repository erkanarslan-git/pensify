CREATE OR REPLACE FUNCTION public.sync_member_cleaner_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_name text; v_email text;
BEGIN
 IF NEW.role = 'cleaner' AND NEW.active THEN
  SELECT COALESCE(p.full_name, split_part(u.email,'@',1), '—'), u.email INTO v_name,v_email FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=NEW.user_id;
  INSERT INTO public.cleaners(organization_id,user_id,full_name,email,active) VALUES(NEW.organization_id,NEW.user_id,COALESCE(v_name,'—'),v_email,true)
  ON CONFLICT(user_id) DO UPDATE SET active=true WHERE cleaners.organization_id=EXCLUDED.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cleaner belongs to another organization' USING ERRCODE='23514'; END IF;
 ELSIF TG_OP='UPDATE' AND OLD.role='cleaner' THEN
  UPDATE public.cleaners SET active=false WHERE user_id=NEW.user_id AND organization_id=NEW.organization_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_member_cleaner_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER membership_cleaner_profile AFTER INSERT OR UPDATE OF role,active ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.sync_member_cleaner_profile();
CREATE OR REPLACE FUNCTION public.list_team_cleaners() RETURNS TABLE(id uuid,user_id uuid,full_name text,phone text,email text,active boolean,notes text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid:=public.default_organization_id();
BEGIN
 IF v_org IS NULL OR NOT public.has_organization_role(v_org,ARRAY['owner','admin','operations_manager']::public.org_role[]) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.id,c.user_id,c.full_name,c.phone,c.email,c.active,c.notes FROM public.cleaners c JOIN public.organization_members m ON m.user_id=c.user_id AND m.organization_id=c.organization_id WHERE c.organization_id=v_org AND m.role='cleaner' ORDER BY c.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.list_team_cleaners() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_team_cleaners() TO authenticated,service_role;