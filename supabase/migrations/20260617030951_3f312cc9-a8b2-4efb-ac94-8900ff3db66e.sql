
-- Hannover city
INSERT INTO public.cities (name, country) VALUES ('Hannover','DE') ON CONFLICT DO NOTHING;

-- Real cleaner: Erkan Arslan (Hannover) — user_id will be linked after they sign up
INSERT INTO public.cleaners (full_name, phone, active, notes)
SELECT 'Erkan Arslan', '+4917663421023', true, 'Hannover'
WHERE NOT EXISTS (SELECT 1 FROM public.cleaners WHERE phone = '+4917663421023');

-- Admin visibility policies
CREATE POLICY "profiles_admin_select_all" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

CREATE POLICY "user_roles_admin_select_all" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- Admin RPCs (security definer)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, full_name text, roles app_role[], created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.full_name,
      COALESCE(ARRAY_AGG(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::app_role[]),
      u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    GROUP BY u.id, u.email, p.full_name, u.created_at
    ORDER BY u.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_role(_user_id uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Prevent removing the last owner
  IF _role = 'owner' AND (SELECT COUNT(*) FROM public.user_roles WHERE role='owner') <= 1 THEN
    RAISE EXCEPTION 'cannot remove last owner';
  END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id AND role=_role;
END $$;

CREATE OR REPLACE FUNCTION public.admin_link_cleaner(_cleaner_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Clear any existing cleaner linked to this user
  IF _user_id IS NOT NULL THEN
    UPDATE public.cleaners SET user_id = NULL WHERE user_id = _user_id AND id <> _cleaner_id;
    -- Auto-grant cleaner role
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'cleaner') ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.cleaners SET user_id = _user_id WHERE id = _cleaner_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_remove_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_link_cleaner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_cleaner(uuid, uuid) TO authenticated;
