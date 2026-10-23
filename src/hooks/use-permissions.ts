import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { effectivePermission, type AppRole } from "@/lib/permissions";

interface RolePermRow { role: AppRole; permission: string; allowed: boolean }
interface UserPermRow { permission: string; allowed: boolean }

export interface PermissionsState {
  userId: string | null;
  roles: AppRole[];
  isOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean; // owner|admin|manager|reception
  can: (key: string) => boolean;
  loading: boolean;
}

export function usePermissions(): PermissionsState {
  const q = useQuery({
    queryKey: ["my-permissions"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: ures } = await supabase.auth.getUser();
      const user = ures?.user ?? null;
      if (!user) return { userId: null, roles: [] as AppRole[], rolePerms: [] as RolePermRow[], userPerms: [] as UserPermRow[] };
      const { data: orgId, error: orgError } = await supabase.rpc("active_organization_id");
      if (orgError || !orgId) return { userId: user.id, roles: [] as AppRole[], rolePerms: [] as RolePermRow[], userPerms: [] as UserPermRow[] };
      const [{ data: rolesData }, { data: rolePerms }, { data: userPerms }] = await Promise.all([
        supabase.rpc("my_app_roles"),
        supabase.from("role_permissions").select("role,permission,allowed").eq("organization_id", orgId),
        supabase.from("user_permissions").select("permission,allowed").eq("organization_id", orgId).eq("user_id", user.id),
      ]);
      return {
        userId: user.id,
        roles: ((rolesData ?? []) as AppRole[]),
        rolePerms: (rolePerms ?? []) as RolePermRow[],
        userPerms: (userPerms ?? []) as UserPermRow[],
      };
    },
  });

  const userId = q.data?.userId ?? null;
  const roles = (q.data?.roles ?? []) as AppRole[];
  const rolePerms = q.data?.rolePerms ?? [];
  const userPerms = q.data?.userPerms ?? [];

  const isOwner = roles.includes("owner");
  const isAdmin = isOwner || roles.includes("admin");

  const can = (key: string): boolean => effectivePermission(key, roles, rolePerms, userPerms);

  return {
    userId,
    roles,
    isOwner,
    isAdmin,
    isStaff: roles.some((r) => ["owner", "admin", "manager", "reception"].includes(r)),
    can,
    loading: q.isLoading,
  };
}
