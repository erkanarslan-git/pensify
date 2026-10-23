import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { canAccessRoute, type AppRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Remember a scanned QR so login returns to the same clock screen.
      const m = /^\/clock\/([A-Za-z0-9_-]{1,128})$/.exec(location.pathname);
      if (m) sessionStorage.setItem("pensify.clockToken", m[1]);
      throw redirect({ to: "/auth" });
    }

    // Roles come from the user's single active organization membership (fail closed).
    const { data: roles, error: rolesError } = await supabase.rpc("my_app_roles");
    // A temporary outage must not look like "no access": show the error page with retry.
    if (rolesError) throw new Error("roles_unavailable");
    const roleList = ((roles ?? []) as AppRole[]);
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
    const { data: reportTeams, error: reportError } = path === "/work-report"
       ? await supabase.rpc("my_report_teams")
       : { data: [], error: null };
     const { data: timeAccess } = path === "/time-tracking" ? await supabase.rpc("my_time_management_access") : { data: false };
     const financePath = path === "/payments" || path.startsWith("/payments/") || path === "/analytics";
     let financeAllowed = false;
     if (financePath) {
       const { data: org } = await supabase.rpc("active_organization_id");
       if (org) {
         const { data: allowed, error: permissionError } = await supabase.rpc("has_organization_permission", {
           _org: org, _permission: path === "/payments/bank" ? "manage_bank" : "view_finance",
         });
         financeAllowed = !permissionError && allowed === true;
       }
     }
     if (!canAccessRoute(path, roleList, reportError ? [] : reportTeams ?? [], timeAccess === true, () => financeAllowed)) {
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
