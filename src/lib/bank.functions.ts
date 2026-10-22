import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RATE_LIMIT_MS = 10 * 60_000;

async function requireBankManager(supabase: any, connectionId: string) {
  const { data: conn } = await supabase.from("bank_connections").select("id,organization_id,provider,secret_ref,last_attempt_at,status").eq("id", connectionId).maybeSingle();
  if (!conn) throw new Error("not_found");
  const { data: ok } = await supabase.rpc("has_organization_permission", { _org: conn.organization_id, _permission: "manage_bank" });
  if (!ok) throw new Error("forbidden");
  return conn as { id: string; organization_id: string; provider: string; secret_ref: string | null; last_attempt_at: string | null; status: string };
}

export const checkBankNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await requireBankManager(context.supabase, data.connectionId);
    if (conn.last_attempt_at && Date.now() - Date.parse(conn.last_attempt_at) < RATE_LIMIT_MS) return { ok: false, reason: "rate_limited" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runBankSync } = await import("./bank/sync.server");
    return runBankSync(supabaseAdmin, conn.id);
  });

export const disconnectBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const conn = await requireBankManager(context.supabase, data.connectionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAdapter, BankNotConfiguredError } = await import("./bank/providers.server");
    try {
      const a = getAdapter(conn.provider);
      if (a.revokeAccess && conn.secret_ref) await a.revokeAccess({ secretRef: conn.secret_ref });
    } catch (e) {
      if (!(e instanceof BankNotConfiguredError)) return { ok: false, reason: "revoke_failed" };
    }
    // Stops future syncs; transaction and payment history stay untouched.
    await supabaseAdmin.from("bank_connections").update({ status: "disconnected", disconnected_at: new Date().toISOString(), disconnected_by: context.userId, sync_lock_until: null, next_check_at: null }).eq("id", conn.id);
    await supabaseAdmin.from("bank_accounts").update({ active: false }).eq("connection_id", conn.id);
    return { ok: true };
  });
