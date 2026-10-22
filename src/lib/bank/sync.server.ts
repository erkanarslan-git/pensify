import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BankNotConfiguredError, getAdapter } from "./providers.server";
import { decideMatch, type OpenInstallment } from "./matching";

type Admin = SupabaseClient<Database>;
const LOCK_MINUTES = 10;

/** Loads open installments for one organization, remaining computed from valid (non-reversed) payments. */
export async function loadOpenInstallments(db: Admin, orgId: string): Promise<OpenInstallment[]> {
  const [{ data: s }, { data: p }, { data: r }] = await Promise.all([
    db.from("payment_schedules").select("id,reservation_id,payment_reference,amount,currency,kind").eq("organization_id", orgId),
    db.from("payments").select("schedule_id,amount").eq("organization_id", orgId).is("reversed_at", null),
    db.from("reservations").select("id,payer_ibans").eq("organization_id", orgId).is("deleted_at", null),
  ]);
  const paid = new Map<string, number>();
  for (const x of p ?? []) if (x.schedule_id) paid.set(x.schedule_id, (paid.get(x.schedule_id) ?? 0) + Number(x.amount));
  const ibans = new Map((r ?? []).map((x) => [x.id, x.payer_ibans ?? []]));
  return (s ?? [])
    .filter((x) => ibans.has(x.reservation_id))
    .map((x) => ({
      id: x.id, reservationId: x.reservation_id, reference: x.payment_reference, currency: x.currency,
      kind: x.kind as OpenInstallment["kind"], payerIbans: ibans.get(x.reservation_id) ?? [],
      remaining: Math.round((Number(x.amount) - (paid.get(x.id) ?? 0)) * 100) / 100,
    }))
    .filter((x) => x.remaining > 0);
}

/** Runs matching on booked, unmatched incoming transactions. Auto-settles only when enabled. */
export async function matchOrganization(db: Admin, orgId: string, autoEnabled: boolean) {
  const { data: txs } = await db.from("bank_transactions")
    .select("id,amount,currency,booking_status,remittance,counterparty_iban")
    .eq("organization_id", orgId).eq("match_state", "unmatched").eq("booking_status", "booked").eq("is_sample", false).limit(500);
  let open = await loadOpenInstallments(db, orgId);
  for (const t of txs ?? []) {
    const d = decideMatch({ amount: Number(t.amount), currency: t.currency, bookingStatus: "booked", remittance: t.remittance, counterpartyIban: t.counterparty_iban }, open);
    if (d.kind === "auto" && autoEnabled) {
      const { error } = await db.rpc("_apply_bank_match", {
        _tx_id: t.id, _allocations: d.allocations.map((a) => ({ schedule_id: a.scheduleId, amount: a.amount })), _link_payment_ids: [], _actor: null as unknown as string, _auto: true,
      });
      if (error) await db.from("bank_transactions").update({ match_state: "review", review_reason: "auto_failed" }).eq("id", t.id).eq("match_state", "unmatched");
      open = await loadOpenInstallments(db, orgId);
    } else if (d.kind === "auto" || d.kind === "review") {
      const reason = d.kind === "review" ? d.reason : "suggested";
      await db.from("bank_transactions").update({ match_state: "review", review_reason: reason }).eq("id", t.id).eq("match_state", "unmatched");
    }
  }
}

/** One connection sync with a DB lock so parallel runs never process the same data twice. */
export async function runBankSync(db: Admin, connectionId: string): Promise<{ ok: boolean; reason?: string }> {
  const now = new Date();
  const { data: locked } = await db.from("bank_connections")
    .update({ sync_lock_until: new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString(), last_attempt_at: now.toISOString() })
    .eq("id", connectionId).eq("status", "connected")
    .or(`sync_lock_until.is.null,sync_lock_until.lt.${now.toISOString()}`)
    .select("id,organization_id,provider,secret_ref,sync_cursor").maybeSingle();
  if (!locked) return { ok: false, reason: "busy_or_not_connected" };
  try {
    const adapter = getAdapter(locked.provider);
    const { data: accounts } = await db.from("bank_accounts").select("id,provider_account_id").eq("connection_id", locked.id).eq("active", true);
    let cursor = locked.sync_cursor;
    for (const acc of accounts ?? []) {
      const res = await adapter.fetchTransactions({ secretRef: locked.secret_ref ?? "", providerAccountId: acc.provider_account_id, cursor: locked.sync_cursor });
      cursor = res.nextCursor ?? cursor;
      if (res.transactions.length) {
        await db.from("bank_transactions").upsert(res.transactions.map((t) => ({
          organization_id: locked.organization_id, account_id: acc.id, provider_transaction_id: t.providerTransactionId,
          booking_status: t.bookingStatus, booking_date: t.bookingDate, value_date: t.valueDate, amount: t.amount, currency: t.currency,
          remittance: t.remittance, counterparty_name: t.counterpartyName, counterparty_iban: t.counterpartyIban, updated_at: new Date().toISOString(),
        })), { onConflict: "organization_id,account_id,provider_transaction_id" });
      }
    }
    const { data: settings } = await db.from("bank_settings").select("auto_match_enabled").eq("organization_id", locked.organization_id).maybeSingle();
    await matchOrganization(db, locked.organization_id, settings?.auto_match_enabled ?? false);
    await db.from("bank_connections").update({ last_success_at: new Date().toISOString(), last_error: null, sync_cursor: cursor, sync_lock_until: null }).eq("id", locked.id);
    return { ok: true };
  } catch (e) {
    const notConfigured = e instanceof BankNotConfiguredError;
    await db.from("bank_connections").update({ status: notConfigured ? "not_configured" : "error", last_error: notConfigured ? "not_configured" : "sync_failed", sync_lock_until: null }).eq("id", locked.id);
    console.error("bank sync failed", connectionId, notConfigured ? "not_configured" : (e as Error).message);
    return { ok: false, reason: notConfigured ? "not_configured" : "sync_failed" };
  }
}
