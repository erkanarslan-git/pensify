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
  .inputValidator((d: unknown) => {
    const r = testPropertySchema.safeParse(d);
    if (r.success) return r.data;
    const LABELS: Record<string, string> = {
      name: "Name der Unterkunft", address: "Adresse", zip: "PLZ", city: "Stadt", phone: "Telefon",
      contact_email: "Kontakt-E-Mail", booking_email: "Buchungs-E-Mail", first_name: "Vorname (Konto)",
      last_name: "Nachname (Konto)", email: "E-Mail (Konto)", account_phone: "Telefon (Konto)", confirm: "Bestätigung",
    };
    const fields = [...new Set(r.error.issues.map((i) => LABELS[String(i.path[0])] ?? String(i.path[0])))];
    throw new Error(`Bitte prüfen: ${fields.join(", ")}`);
  })
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
    // Merge with the current row: the webhook may already have written received_at/http_status.
    const { data: cur } = await supabaseAdmin.from("channel_accounts").select("last_webhook_test").eq("id", acc.id).single();
    const prev = (cur?.last_webhook_test as Record<string, unknown> | null) ?? {};
    const keep = prev["started_at"] === startedAt ? prev : {};
    const state = res.ok ? { ...keep, started_at: startedAt, accepted: true } : { ...keep, started_at: startedAt, accepted: false, error: res.errorMessage };
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

// ---------------- Real (pilot) WuBook property per Pensify property (admin only) ----------------
// Creates a NON-test WuBook account+property and links it to one Pensify property.
// Stays disabled + dry-run: no rooms, prices or availability are sent here.
const pilotSchema = testPropertySchema.extend({ property_id: z.string().uuid() });

export const listWuBookPilotProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("channel_property_mappings")
      .select("id, property_id, external_property_code, enabled, created_at, account:channel_accounts!inner(is_test, wubook_acode)")
      .eq("organization_id", orgId);
    return (data ?? [])
      .filter((m) => !(m.account as { is_test: boolean } | null)?.is_test)
      .map((m) => ({ id: m.id, propertyId: m.property_id, lcode: m.external_property_code, enabled: m.enabled, createdAt: m.created_at, acode: (m.account as { wubook_acode: string | null } | null)?.wubook_acode ?? null }));
  });

export const createWuBookPilotProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const r = pilotSchema.safeParse(d);
    if (r.success) return r.data;
    throw new Error(`Bitte prüfen: ${[...new Set(r.error.issues.map((i) => String(i.path[0])))].join(", ")}`);
  })
  .handler(async ({ data, context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    if (rateLimited(`wubook-pilot:${orgId}`, 2, 10 * 60_000)) return { ok: false as const, errorMessage: "Zu viele Versuche. Bitte in 10 Minuten erneut." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prop } = await supabaseAdmin.from("properties").select("id").eq("id", data.property_id).eq("organization_id", orgId).maybeSingle();
    if (!prop) return { ok: false as const, errorMessage: "Pension nicht gefunden." };
    const { data: existing } = await supabaseAdmin
      .from("channel_property_mappings")
      .select("id, external_property_code, account:channel_accounts!inner(is_test)")
      .eq("organization_id", orgId)
      .eq("property_id", data.property_id);
    const real = (existing ?? []).find((m) => !(m.account as { is_test: boolean } | null)?.is_test);
    if (real) return { ok: false as const, errorMessage: `Diese Pension ist bereits mit WuBook verbunden (Code ${real.external_property_code}).` };

    const { data: acc, error } = await supabaseAdmin
      .from("channel_accounts")
      .insert({ organization_id: orgId, provider: "wubook", is_test: false, enabled: false, dry_run: true, property_code: null } as never)
      .select("id")
      .single();
    if (error || !acc) return { ok: false as const, errorMessage: "Konto konnte nicht vorbereitet werden." };

    const { createTestProperty, run } = await import("@/lib/wubook/actions.server");
    const { confirm: _c, property_id: _p, ...input } = data;
    const res = await run(() => createTestProperty(input));
    if (!res.ok) {
      await supabaseAdmin.from("channel_accounts").delete().eq("id", acc.id);
      await audit(orgId, context.userId, "pilot_property_failed", { property_id: data.property_id, error_code: res.errorCode });
      return { ok: false as const, errorMessage: res.errorMessage };
    }
    await supabaseAdmin
      .from("channel_accounts")
      .update({ wubook_acode: res.data.acode, wubook_lcode: res.data.lcode, property_code: res.data.lcode, last_error: null } as never)
      .eq("id", acc.id);
    await supabaseAdmin.from("channel_property_mappings").insert({
      organization_id: orgId, account_id: acc.id, property_id: data.property_id, external_property_code: res.data.lcode, enabled: false,
    } as never);
    await audit(orgId, context.userId, "pilot_property_created", { property_id: data.property_id, lcode: res.data.lcode, acode: res.data.acode });
    return { ok: true as const, acode: res.data.acode, lcode: res.data.lcode, password: res.data.password };
  });

// ---------------- Pilot room: one WuBook room type for one Pensify room type ----------------
async function loadPilot(orgId: string, propertyId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("channel_property_mappings")
    .select("id, external_property_code, account:channel_accounts!inner(is_test)")
    .eq("organization_id", orgId)
    .eq("property_id", propertyId);
  return (data ?? []).find((m) => !(m.account as { is_test: boolean } | null)?.is_test) ?? null;
}

const pilotRoomSchema = z.object({ property_id: z.string().uuid(), room_type_id: z.string().uuid(), avail: z.number().int().min(1).max(1) });

export const createWuBookPilotRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pilotRoomSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    if (rateLimited(`wubook-room:${orgId}`, 3, 10 * 60_000)) return { ok: false as const, errorMessage: "Zu viele Versuche." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pm = await loadPilot(orgId, data.property_id);
    if (!pm) return { ok: false as const, errorMessage: "Pension ist nicht mit WuBook verbunden." };
    const { data: rt } = await supabaseAdmin
      .from("room_types").select("id, name, code, capacity").eq("id", data.room_type_id).eq("property_id", data.property_id).eq("organization_id", orgId).maybeSingle();
    if (!rt) return { ok: false as const, errorMessage: "Zimmertyp nicht gefunden." };
    const { data: existing } = await supabaseAdmin
      .from("channel_room_mappings").select("external_room_id").eq("property_id", data.property_id).eq("channel", "wubook").eq("room_type_id", rt.id).maybeSingle();
    if (existing?.external_room_id) return { ok: false as const, errorMessage: `Bereits angelegt (WuBook-Zimmer ${existing.external_room_id}).` };
    const { data: plan } = await supabaseAdmin.from("rate_plans").select("id, base_price").eq("room_type_id", rt.id).eq("active", true).limit(1).maybeSingle();
    const price = Number(plan?.base_price ?? 0);
    if (!(price > 0)) return { ok: false as const, errorMessage: "Kein Preis für diesen Zimmertyp hinterlegt." };

    const { createRoom, run } = await import("@/lib/wubook/actions.server");
    const res = await run(() => createRoom(pm.external_property_code, { name: rt.name, beds: rt.capacity, price, avail: data.avail, shortname: rt.code.slice(0, 4) }));
    if (!res.ok) {
      await audit(orgId, context.userId, "pilot_room_failed", { property_id: data.property_id, room_type_id: rt.id, error_code: res.errorCode });
      return { ok: false as const, errorMessage: res.errorMessage };
    }
    await supabaseAdmin.from("channel_room_mappings").insert({
      organization_id: orgId, channel: "wubook", room_type_id: rt.id, rate_plan_id: plan?.id ?? null, property_id: data.property_id,
      property_mapping_id: pm.id, external_room_id: res.data, sync_enabled: false,
    } as never);
    await audit(orgId, context.userId, "pilot_room_created", { property_id: data.property_id, room_type_id: rt.id, rid: res.data, price, avail: data.avail });
    return { ok: true as const, rid: res.data, price };
  });

/** Read-only check: is the mapped WuBook room present with the expected values? */
export const checkWuBookPilotRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ property_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { orgId } = await requireOrgRole(context.supabase, ADMIN_ROLES);
    const pm = await loadPilot(orgId, data.property_id);
    if (!pm) return { ok: false as const, errorMessage: "Pension ist nicht mit WuBook verbunden." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: maps } = await supabaseAdmin
      .from("channel_room_mappings").select("external_room_id, room_type:room_types(name)").eq("property_mapping_id", pm.id);
    const { fetchRooms, run } = await import("@/lib/wubook/actions.server");
    const res = await run(() => fetchRooms(pm.external_property_code));
    if (!res.ok) return { ok: false as const, errorMessage: res.errorMessage };
    const rooms = res.data;
    return {
      ok: true as const,
      lcode: pm.external_property_code,
      wubookRooms: rooms,
      mappings: (maps ?? []).map((m) => ({
        rid: m.external_room_id,
        roomType: (m.room_type as { name: string } | null)?.name ?? "—",
        found: rooms.some((r) => r.id === m.external_room_id),
      })),
    };
  });
