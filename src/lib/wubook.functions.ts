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

// ---------------- Test property + webhook (admin only) ----------------
import { z } from "zod";

const testPropertySchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(2).max(200),
  zip: z.string().trim().min(3).max(12),
  city: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(5).max(30),
  contact_email: z.string().trim().email().max(255),
  booking_email: z.string().trim().email().max(255),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  account_phone: z.string().trim().min(5).max(30),
  confirm: z.literal(true),
});

async function audit(orgId: string, userId: string, action: string, metadata: Record<string, unknown>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({ organization_id: orgId, actor_id: userId, entity: "wubook_test_property", entity_id: null, action, diff: null, metadata: metadata as never });
  } catch {
    /* audit must not break the action */
  }
}

async function getTestAccount(orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("channel_accounts")
    .select("id, wubook_acode, wubook_lcode, last_push_url_check, last_webhook_test, created_at")
    .eq("organization_id", orgId)
    .eq("provider", "wubook")
    .eq("is_test", true)
    .maybeSingle();
  return data;
}

export const getWuBookWebhookStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    const { webhookUrl, maskWebhookUrl, isImportEnabled } = await import("@/lib/wubook/actions.server");
    const acc = await getTestAccount(orgId);
    let expected: string | null = null;
    try { expected = maskWebhookUrl(webhookUrl()); } catch { expected = null; }
    const { data: inbox } = await context.supabase
      .from("wubook_inbox")
      .select("id, lcode, rcode, event_type, status, received_at")
      .eq("organization_id", orgId)
      .order("received_at", { ascending: false })
      .limit(10);
    return {
      testAccount: acc
        ? { acode: acc.wubook_acode, lcode: acc.wubook_lcode, createdAt: acc.created_at, pushUrlCheck: acc.last_push_url_check as Record<string, string | number | boolean | null> | null, webhookTest: acc.last_webhook_test as Record<string, string | number | boolean | null> | null }
        : null,
      expectedUrl: expected,
      importEnabled: isImportEnabled(),
      inbox: inbox ?? [],
    };
  });

export const createWuBookTestProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testPropertySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    if (rateLimited(`wubook-create:${orgId}`, 2, 10 * 60_000)) return { ok: false as const, errorMessage: "Zu viele Versuche." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Idempotency: reserve the single test slot BEFORE calling WuBook.
    const existing = await getTestAccount(orgId);
    if (existing?.wubook_lcode) return { ok: false as const, errorMessage: "Testunterkunft existiert bereits.", lcode: existing.wubook_lcode };
    let accountId = existing?.id;
    if (!accountId) {
      const { data: row, error } = await supabaseAdmin
        .from("channel_accounts")
        .insert({ organization_id: orgId, provider: "wubook", is_test: true, enabled: false, dry_run: true, property_code: null } as never)
        .select("id")
        .single();
      if (error || !row) return { ok: false as const, errorMessage: "Testunterkunft wird bereits angelegt." };
      accountId = row.id;
    }
    const { createTestProperty, run } = await import("@/lib/wubook/actions.server");
    const { confirm: _c, ...input } = data;
    const res = await run(() => createTestProperty(input));
    if (!res.ok) {
      await supabaseAdmin.from("channel_accounts").update({ last_error: res.errorCode }).eq("id", accountId);
      await audit(orgId, context.userId, "test_property_failed", { error_code: res.errorCode });
      return { ok: false as const, errorMessage: res.errorMessage };
    }
    await supabaseAdmin
      .from("channel_accounts")
      .update({ wubook_acode: res.data.acode, wubook_lcode: res.data.lcode, property_code: res.data.lcode, last_error: null } as never)
      .eq("id", accountId);
    await audit(orgId, context.userId, "test_property_created", { lcode: res.data.lcode, acode: res.data.acode });
    // Password is returned exactly once and never stored.
    return { ok: true as const, acode: res.data.acode, lcode: res.data.lcode, password: res.data.password };
  });

export const startWuBookWebhookTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    if (rateLimited(`wubook-push:${orgId}`, 3, 60_000)) return { ok: false as const, errorMessage: "Zu viele Tests — bitte kurz warten." };
    const acc = await getTestAccount(orgId);
    if (!acc?.wubook_lcode) return { ok: false as const, errorMessage: "Keine Testunterkunft vorhanden." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startedAt = new Date().toISOString();
    await supabaseAdmin.from("channel_accounts").update({ last_webhook_test: { started_at: startedAt } as never }).eq("id", acc.id);
    const { activatePushTest, run } = await import("@/lib/wubook/actions.server");
    const res = await run(() => activatePushTest(acc.wubook_lcode!));
    const state = res.ok ? { started_at: startedAt, accepted: true } : { started_at: startedAt, accepted: false, error: res.errorMessage };
    await supabaseAdmin.from("channel_accounts").update({ last_webhook_test: state as never }).eq("id", acc.id);
    await audit(orgId, context.userId, res.ok ? "webhook_test_started" : "webhook_test_failed", { lcode: acc.wubook_lcode, error_code: res.ok ? null : res.errorCode });
    return res.ok ? { ok: true as const } : { ok: false as const, errorMessage: res.errorMessage };
  });

export const checkWuBookPushUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    if (rateLimited(`wubook-pushurl:${orgId}`, 5, 60_000)) return { ok: false as const, errorMessage: "Zu viele Anfragen." };
    const acc = await getTestAccount(orgId);
    if (!acc?.wubook_lcode) return { ok: false as const, errorMessage: "Keine Testunterkunft vorhanden." };
    const { readPushUrl, webhookUrl, maskWebhookUrl, run } = await import("@/lib/wubook/actions.server");
    const res = await run(() => readPushUrl(acc.wubook_lcode!));
    if (!res.ok) return { ok: false as const, errorMessage: res.errorMessage };
    let expected = "";
    try { expected = webhookUrl(); } catch { /* missing secret */ }
    const check = { checked_at: new Date().toISOString(), registered: maskWebhookUrl(res.data), matches: !!res.data && res.data === expected };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("channel_accounts").update({ last_push_url_check: check as never }).eq("id", acc.id);
    return { ok: true as const, ...check };
  });

export const fetchWuBookNewBookingsReadOnly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    if (rateLimited(`wubook-fetchnew:${orgId}`, 5, 60_000)) return { ok: false as const, errorMessage: "Zu viele Anfragen." };
    const acc = await getTestAccount(orgId);
    if (!acc?.wubook_lcode) return { ok: false as const, errorMessage: "Keine Testunterkunft vorhanden." };
    const { fetchNewBookingsReadOnly, run } = await import("@/lib/wubook/actions.server");
    const res = await run(() => fetchNewBookingsReadOnly(acc.wubook_lcode!));
    await audit(orgId, context.userId, "fetch_new_bookings_readonly", { lcode: acc.wubook_lcode, ok: res.ok });
    return res.ok ? { ok: true as const, lcode: acc.wubook_lcode, pending: res.data } : { ok: false as const, errorMessage: res.errorMessage };
  });
