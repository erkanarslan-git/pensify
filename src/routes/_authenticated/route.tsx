import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { canAccessRoute, type AppRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const roleList = (roles ?? []).map((r) => r.role as AppRole);
    const path = location.pathname;
    const hasAnyRole = roleList.length > 0;

    // No role → only /request-access is allowed
    if (!hasAnyRole) {
      if (path !== "/request-access") throw redirect({ to: "/request-access" });
      return { user: data.user, roles: roleList };
    }
    // Has role and on request-access → bounce home
    if (path === "/request-access") {
      throw redirect({ to: "/" });
    }
    // Strict per-route role check
    if (!canAccessRoute(path, roleList)) {
      // Cleaner-only users land on /me; everyone else home
      const isCleaner = roleList.includes("cleaner");
      const isStaff = roleList.some((r) => ["owner", "admin", "manager", "reception"].includes(r));
      if (isCleaner && !isStaff) throw redirect({ to: "/me" });
      throw redirect({ to: "/" });
    }
    return { user: data.user, roles: roleList };
  },
  component: () => <Outlet />,
});
