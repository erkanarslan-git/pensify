import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    const isStaff = ["owner", "admin", "manager"].some((r) => roleSet.has(r as any));
    const isCleaner = roleSet.has("cleaner" as any);

    const path = location.pathname;
    const hasAnyRole = roleSet.size > 0;
    // Users with no role at all → must request access
    if (!hasAnyRole && path !== "/request-access") {
      throw redirect({ to: "/request-access" });
    }
    if (hasAnyRole && path === "/request-access") {
      throw redirect({ to: "/" });
    }
    // Cleaner-only users may only access /me and /clock/*
    const allowedForCleaner =
      path === "/me" || path.startsWith("/clock/") || path.startsWith("/me/") || path === "/request-access";
    if (isCleaner && !isStaff && !allowedForCleaner) {
      throw redirect({ to: "/me" });
    }
    return { user: data.user, roles: Array.from(roleSet), isStaff, isCleaner };
  },
  component: () => <Outlet />,
});
