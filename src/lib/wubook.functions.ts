// Authenticated WuBook server functions. Client-safe module: server-only
// imports happen inside handlers.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole, ADMIN_ROLES } from "@/lib/org-auth.server";
import { rateLimited, clientIp } from "@/lib/http-security.server";
import { getRequest } from "@tanstack/react-start/server";

export const testWuBookConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Server-side authorization: owner/admin of the caller's single active org.
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);

    // Ad-hoc rate limit: 5 tests per minute per user (no durable limiter exists yet).
    const ip = clientIp(getRequest());
    if (rateLimited(`wubook-test:${context.userId}:${ip}`, 5, 60_000)) {
      return { ok: false as const, error: "rate_limited" };
    }

    const { testConnection } = await import("@/lib/wubook/service.server");
    const result = await testConnection();

    // Technical audit event (sanitized: no token, no XML, no credentials).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("audit_logs").insert({
        organization_id: orgId,
        actor_id: context.userId,
        entity: "wubook_connection",
        entity_id: null,
        action: result.connected ? "connection_test_ok" : "connection_test_failed",
        diff: null,
        metadata: {
          mode: result.mode,
          outbound_enabled: result.outboundEnabled,
          error_code: result.errorCode,
          subaccounts: result.subaccounts,
        },
      });
    } catch {
      // Audit failure must not break the connection test.
    }

    return { ok: true as const, result };
  });

/** Lets the UI show whether the server secret is configured (boolean only). */
export const getWuBookConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOrgRole(context.supabase, ADMIN_ROLES);
    const { getWuBookConfig } = await import("@/lib/wubook/service.server");
    const { config, missing } = getWuBookConfig();
    return {
      configured: missing.length === 0,
      missing,
      mode: config?.mode ?? "shadow",
      outboundEnabled: config?.outboundEnabled ?? false,
      corporateCode: config?.corporateCode ?? null,
    };
  });
