-- Staff may read the locations they are allowed to work in (restrictive tenant/property policies still apply).
CREATE POLICY properties_scoped_read ON public.properties FOR SELECT TO authenticated
USING (public.can_access_property(id));