// WuBook push webhook handler. Server-only. Stores a small inbox record and
// answers 200 fast. Never processes bookings inline; never logs the secret.
import { z } from "zod";
import { clientIp, jsonError, rateLimited, readLimitedText, safeEqual } from "@/lib/http-security.server";
import { WUBOOK_TEST_LCODE, WUBOOK_TEST_RCODE, isImportEnabled } from "./actions.server";

const MAX_BYTES = 4 * 1024;
const TEST_WINDOW_MS = 15 * 60_000;
const bodySchema = z.object({
  lcode: z.string().regex(/^\d{1,20}$/),
  rcode: z.string().regex(/^\d{1,30}$/),
});

export type InboxStore = {
  findTestAccountsStartedSince(sinceIso: string): Promise<Array<{ id: string; organization_id: string }>>;
  findAccountsByLcode(lcode: string): Promise<Array<{ id: string; organization_id: string }>>;
  insertInbox(row: {
    organization_id: string;
    account_id: string;
    lcode: string;
    rcode: string;
    event_type: "test" | "booking";
    status: "test_received" | "received_not_processed";
    meta: Record<string, unknown>;
  }): Promise<void>;
  markTestReceived(accountId: string, atIso: string): Promise<void>;
};

export async function handleWuBookWebhook(request: Request, secretParam: string, store?: InboxStore): Promise<Response> {
  const expected = process.env["WUBOOK_WEBHOOK_SECRET"];
  if (!expected || !secretParam || !safeEqual(secretParam, expected)) return new Response("Not found", { status: 404 });
  if (rateLimited(`wh:wubook:${clientIp(request)}`, 60, 60_000)) return jsonError(429, "rate_limited");

  const text = await readLimitedText(request, MAX_BYTES);
  if (text === null) return jsonError(413, "payload_too_large");
  const ct = request.headers.get("content-type") ?? "";
  let fields: Record<string, string> = {};
  try {
    if (ct.includes("application/json")) fields = JSON.parse(text);
    else fields = Object.fromEntries(new URLSearchParams(text));
  } catch {
    return jsonError(400, "invalid_body");
  }
  const parsed = bodySchema.safeParse({ lcode: String(fields.lcode ?? ""), rcode: String(fields.rcode ?? "") });
  if (!parsed.success) return jsonError(400, "invalid_payload");
  const { lcode, rcode } = parsed.data;

  const s = store ?? (await defaultStore());
  const now = new Date().toISOString();
  try {
    if (lcode === WUBOOK_TEST_LCODE && rcode === WUBOOK_TEST_RCODE) {
      // Test ping: attribute to orgs that started a test recently. No fetch_booking.
      const accounts = await s.findTestAccountsStartedSince(new Date(Date.now() - TEST_WINDOW_MS).toISOString());
      for (const a of accounts) {
        await s.insertInbox({ organization_id: a.organization_id, account_id: a.id, lcode, rcode, event_type: "test", status: "test_received", meta: { kind: "wubook_test_webhook" } });
        await s.markTestReceived(a.id, now);
      }
      return Response.json({ ok: true });
    }
    // Real notification: only known lcodes, exactly one owning account (fail closed).
    const accounts = await s.findAccountsByLcode(lcode);
    if (accounts.length === 1) {
      const a = accounts[0]!;
      await s.insertInbox({
        organization_id: a.organization_id,
        account_id: a.id,
        lcode,
        rcode,
        event_type: "booking",
        status: "received_not_processed",
        meta: { import_enabled: isImportEnabled() },
      });
    }
  } catch {
    // Store failures must not make WuBook retry-storm us; still answer 200.
  }
  return Response.json({ ok: true });
}

async function defaultStore(): Promise<InboxStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    async findTestAccountsStartedSince(since) {
      const { data } = await supabaseAdmin
        .from("channel_accounts")
        .select("id, organization_id, last_webhook_test")
        .eq("provider", "wubook")
        .eq("is_test", true);
      return (data ?? []).filter((r) => {
        const started = (r.last_webhook_test as Record<string, unknown> | null)?.["started_at"];
        return typeof started === "string" && started >= since;
      });
    },
    async findAccountsByLcode(lcode) {
      const { data } = await supabaseAdmin.from("channel_accounts").select("id, organization_id").eq("provider", "wubook").eq("wubook_lcode", lcode);
      return data ?? [];
    },
    async insertInbox(row) {
      await supabaseAdmin.from("wubook_inbox").upsert(row as never, { onConflict: "organization_id,lcode,rcode,event_type", ignoreDuplicates: true });
    },
    async markTestReceived(accountId, at) {
      const { data } = await supabaseAdmin.from("channel_accounts").select("last_webhook_test").eq("id", accountId).single();
      const prev = (data?.last_webhook_test as Record<string, unknown> | null) ?? {};
      await supabaseAdmin.from("channel_accounts").update({ last_webhook_test: { ...prev, received_at: at, http_status: 200 } as never }).eq("id", accountId);
    },
  };
}
