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

    // Cleaner-only users may only access /me and /clock/*
    const path = location.pathname;
    const allowedForCleaner =
      path === "/me" || path.startsWith("/clock/") || path.startsWith("/me/");
    if (isCleaner && !isStaff && !allowedForCleaner) {
      throw redirect({ to: "/me" });
    }
    return { user: data.user, roles: Array.from(roleSet), isStaff, isCleaner };
  },
  component: () => <Outlet />,
});
