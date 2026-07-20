DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(user_id uuid, email text, full_name text, roles app_role[], created_at timestamp with time zone, banned_until timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, p.full_name,
      COALESCE(ARRAY_AGG(ur.role) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::app_role[]),
      u.created_at,
      u.banned_until
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    GROUP BY u.id, u.email, p.full_name, u.created_at, u.banned_until
    ORDER BY u.created_at DESC;
END $function$;