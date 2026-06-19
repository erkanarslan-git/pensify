import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PERMISSIONS, type AppRole } from "@/lib/permissions";

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
      const [{ data: rolesData }, { data: rolePerms }, { data: userPerms }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        (supabase as any).from("role_permissions").select("role,permission,allowed"),
        (supabase as any).from("user_permissions").select("permission,allowed").eq("user_id", user.id),
      ]);
      return {
        userId: user.id,
        roles: (rolesData ?? []).map((r: { role: AppRole }) => r.role),
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

  const can = (key: string): boolean => {
    if (isOwner) return true; // owner always
    // user override has highest priority
    const u = userPerms.find((p) => p.permission === key);
    if (u) return u.allowed;
    // role override
    for (const r of roles) {
      const o = rolePerms.find((p) => p.role === r && p.permission === key);
      if (o) {
        if (o.allowed) return true;
      }
    }
    // default from catalog
    const def = PERMISSIONS.find((p) => p.key === key);
    if (def && roles.some((r) => def.defaultRoles.includes(r))) return true;
    return false;
  };

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
