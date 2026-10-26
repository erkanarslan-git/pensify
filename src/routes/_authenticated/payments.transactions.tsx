import { displayLocale } from "@/i18n/legacy-ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Ban, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { formatDateDE } from "@/lib/date-de";
import { maskIban, normalizeIban, extractReferences } from "@/lib/bank/matching";

export const Route = createFileRoute("/_authenticated/payments/transactions")({
  head: () => ({ meta: [{ title: "Banka hareketleri — Pension Highway" }, { name: "description", content: "Gelen havaleleri kontrol edin, borçlarla eşleştirin veya hariç tutun." }, { property: "og:title", content: "Banka hareketleri — Pension Highway" }, { property: "og:description", content: "Gelen havaleleri kontrol edin, borçlarla eşleştirin veya hariç tutun." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BankTransactionsPage,
});

type State = "review" | "matched" | "unmatched" | "excluded";
interface Tx { id: string; booking_status: string; booking_date: string | null; amount: number; currency: string; remittance: string | null; counterparty_name: string | null; counterparty_iban: string | null; match_state: State; review_reason: string | null; matched_automatically: boolean; exclude_reason: string | null; is_sample: boolean }
interface Open { id: string; reservation_id: string; payment_reference: string; due_date: string; remaining: number; kind: string; guest: string; ibans: string[] }
interface ManualPay { id: string; reservation_id: string; amount: number; paid_on: string }
const eur = (n: number, c = "EUR") => n.toLocaleString(displayLocale(), { style: "currency", currency: c });

function BankTransactionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const perm = usePermissions();
  const canMatch = perm.can("match_payments") && perm.can("collect_payments");
  const canCorrect = perm.can("correct_payments");
  const [view, setView] = useState<State>("review");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [min, setMin] = useState("");
  const [matching, setMatching] = useState<Tx | null>(null);
  const [reasonFor, setReasonFor] = useState<{ tx: Tx; action: "exclude" | "unmatch" } | null>(null);

  const { data } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: async () => {
      const [tx, s, p, r] = await Promise.all([
        supabase.from("bank_transactions").select("id,booking_status,booking_date,amount,currency,remittance,counterparty_name,counterparty_iban,match_state,review_reason,matched_automatically,exclude_reason,is_sample").order("booking_date", { ascending: false }).limit(2000),
        supabase.from("payment_schedules").select("id,reservation_id,payment_reference,due_date,amount,kind").limit(5000),
        supabase.from("payments").select("id,schedule_id,reservation_id,amount,paid_on,source,bank_transaction_id").is("reversed_at", null).limit(5000),
        supabase.from("reservations").select("id,guest_name,payer_ibans").is("deleted_at", null).limit(5000),
      ]);
      const res = new Map((r.data ?? []).map((x) => [x.id, x]));
      const paid = new Map<string, number>();
      for (const x of p.data ?? []) if (x.schedule_id) paid.set(x.schedule_id, (paid.get(x.schedule_id) ?? 0) + Number(x.amount));
      const open: Open[] = (s.data ?? []).filter((x) => res.has(x.reservation_id)).map((x) => ({
        id: x.id, reservation_id: x.reservation_id, payment_reference: x.payment_reference, due_date: x.due_date, kind: x.kind,
        remaining: Math.round((Number(x.amount) - (paid.get(x.id) ?? 0)) * 100) / 100,
        guest: res.get(x.reservation_id)?.guest_name ?? "—", ibans: res.get(x.reservation_id)?.payer_ibans ?? [],
      })).filter((x) => x.remaining > 0);
      const manual: ManualPay[] = (p.data ?? []).filter((x) => x.source === "manual" && !x.bank_transaction_id).map((x) => ({ id: x.id, reservation_id: x.reservation_id, amount: Number(x.amount), paid_on: x.paid_on }));
      return { txs: (tx.data ?? []).map((x) => ({ ...x, amount: Number(x.amount) })) as Tx[], open, manual, guests: new Map([...res].map(([k, v]) => [k, v.guest_name])) };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["bank-transactions"] }); qc.invalidateQueries({ queryKey: ["payments-page"] }); };

  const counts = useMemo(() => {
    const c: Record<State, number> = { review: 0, matched: 0, unmatched: 0, excluded: 0 };
    for (const x of data?.txs ?? []) c[x.match_state]++;
    return c;
  }, [data]);
  const needle = q.trim().toLowerCase();
  const shown = (data?.txs ?? []).filter((x) =>
    x.match_state === view &&
    (!from || (x.booking_date ?? "") >= from) && (!to || (x.booking_date ?? "") <= to) &&
    (!min || Math.abs(x.amount) >= Number(min)) &&
    (!needle || `${x.counterparty_name ?? ""} ${x.remittance ?? ""}`.toLowerCase().includes(needle)));

  const doReason = async (reason: string) => {
    if (!reasonFor) return;
    if (reason.trim().length < 3) return toast.error(t("bank.reasonRequired"));
    const fn = reasonFor.action === "exclude" ? "exclude_bank_transaction" : "unmatch_bank_transaction";
    const { error } = await supabase.rpc(fn, { _tx_id: reasonFor.tx.id, _reason: reason.trim() });
    if (error) return toast.error(t("bank.failed"));
    toast.success(t("bank.done")); setReasonFor(null); refresh();
  };

  return (
    <AppShell title={t("bank.transactions")} subtitle={t("bank.subtitle")}>
      <Link to="/payments" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"><ArrowLeft className="w-4 h-4" />{t("bank.back")}</Link>
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted mb-3 w-fit">
        {(["review", "unmatched", "matched", "excluded"] as State[]).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{t(`bank.views.${v}`)} ({counts[v]})</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("bank.search")} className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg border border-input bg-card text-sm" />
        <input type="date" aria-label={t("bank.from")} value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-card text-sm" />
        <input type="date" aria-label={t("bank.to")} value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-card text-sm" />
        <input inputMode="decimal" placeholder={t("bank.minAmount")} value={min} onChange={(e) => setMin(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-card text-sm sm:w-28" />
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border/60">
        {shown.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">{t("bank.empty")}</div>}
        {shown.map((x) => (
          <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 sm:flex-1">
              <div className="font-semibold truncate">{x.counterparty_name ?? "—"} <span className="font-mono font-normal text-xs text-muted-foreground">{maskIban(x.counterparty_iban)}</span></div>
              <div className="text-xs text-muted-foreground truncate">{x.booking_date ? formatDateDE(x.booking_date) : "—"} · {x.remittance ?? ""}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {x.is_sample && <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning">{t("bank.sample")}</span>}
                {x.booking_status === "pending" && <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{t("bank.pending")}</span>}
                {x.review_reason && x.match_state === "review" && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{x.review_reason.startsWith("reverted:") ? x.review_reason : t(`bank.reason.${x.review_reason}`)}</span>}
                {x.matched_automatically && <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">{t("bank.auto")}</span>}
                {x.exclude_reason && <span className="text-xs text-muted-foreground">{x.exclude_reason}</span>}
              </div>
            </div>
            <div className={`text-right font-semibold tabular-nums ${x.amount < 0 ? "text-destructive" : ""}`}>{eur(x.amount, x.currency)}</div>
            {(canMatch || canCorrect) && (
              <div className="col-span-2 sm:col-span-1 grid grid-cols-2 sm:flex gap-2">
                {canMatch && (x.match_state === "review" || x.match_state === "unmatched") && x.booking_status === "booked" && x.amount > 0 && !x.is_sample && (
                  <button onClick={() => setMatching(x)} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground"><Check className="w-4 h-4" />{t("bank.match")}</button>
                )}
                {canCorrect && (x.match_state === "review" || x.match_state === "unmatched") && (
                  <button onClick={() => setReasonFor({ tx: x, action: "exclude" })} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-input"><Ban className="w-4 h-4" />{t("bank.exclude")}</button>
                )}
                {canCorrect && (x.match_state === "matched" || x.match_state === "excluded") && (
                  <button onClick={() => setReasonFor({ tx: x, action: "unmatch" })} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-input"><Undo2 className="w-4 h-4" />{t("bank.unmatch")}</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {matching && data && <MatchDialog tx={matching} open={data.open} manual={data.manual} guests={data.guests} onClose={() => setMatching(null)} onDone={refresh} />}
      {reasonFor && <ReasonDialog title={t(reasonFor.action === "exclude" ? "bank.exclude" : "bank.unmatch")} onClose={() => setReasonFor(null)} onConfirm={doReason} />}
    </AppShell>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{title}</h2><button onClick={onClose}><X className="w-4 h-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

function ReasonDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (r: string) => void }) {
  const { t } = useTranslation();
  const [r, setR] = useState("");
  return (
    <Sheet title={title} onClose={onClose}>
      <label className="text-xs text-muted-foreground">{t("bank.reasonLabel")}</label>
      <textarea rows={3} value={r} onChange={(e) => setR(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-card text-base" />
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button onClick={onClose} className="py-3 rounded-xl border border-input">{t("common.cancel")}</button>
        <button onClick={() => onConfirm(r)} className="py-3 rounded-xl bg-primary text-primary-foreground font-medium">{t("bank.confirm")}</button>
      </div>
    </Sheet>
  );
}

function MatchDialog({ tx, open, manual, guests, onClose, onDone }: { tx: Tx; open: Open[]; manual: ManualPay[]; guests: Map<string, string>; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const refs = extractReferences(tx.remittance);
  const iban = normalizeIban(tx.counterparty_iban);
  const isSuggested = (o: Open) => refs.includes(o.payment_reference) || (!!iban && o.ibans.map(normalizeIban).includes(iban));
  const sorted = [...open].sort((a, b) => Number(isSuggested(b)) - Number(isSuggested(a)) || a.due_date.localeCompare(b.due_date));
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const total = Object.values(alloc).reduce((a, v) => a + (Number(v.replace(",", ".")) || 0), 0)
    + manual.filter((m) => links.includes(m.id)).reduce((a, m) => a + m.amount, 0);
  const rest = Math.round((tx.amount - total) * 100) / 100;

  const save = async () => {
    const allocations = Object.entries(alloc).map(([id, v]) => ({ schedule_id: id, amount: Number(v.replace(",", ".")) || 0 })).filter((a) => a.amount > 0);
    if (allocations.length === 0 && links.length === 0) return toast.error(t("bank.nothingSelected"));
    if (rest < -0.004) return toast.error(t("bank.overAllocated"));
    setBusy(true);
    const { error } = await supabase.rpc("apply_bank_match", { _tx_id: tx.id, _allocations: allocations, _link_payment_ids: links.length ? links : undefined });
    setBusy(false);
    if (error) return toast.error(t("bank.failed"));
    toast.success(t("bank.done")); onDone(); onClose();
  };

  return (
    <Sheet title={t("bank.matchTitle")} onClose={onClose}>
      <div className="text-sm mb-3"><span className="font-semibold">{eur(tx.amount, tx.currency)}</span> · {tx.counterparty_name ?? "—"} · <span className="text-muted-foreground">{tx.remittance}</span></div>
      <div className="text-xs font-medium mb-1">{t("bank.openDebts")}</div>
      <div className="space-y-2 mb-4">
        {sorted.slice(0, 40).map((o) => (
          <div key={o.id} className={`grid grid-cols-[minmax(0,1fr)_7rem] gap-2 items-center rounded-lg border p-2 ${isSuggested(o) ? "border-primary bg-primary/5" : "border-border"}`}>
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">{o.guest} {isSuggested(o) && <span className="text-xs text-primary">· {t("bank.suggested")}</span>}</div>
              <div className="text-xs text-muted-foreground">{formatDateDE(o.due_date)} · <span className="font-mono">{o.payment_reference}</span> · {eur(o.remaining)}{o.kind === "deposit" ? " · " + t("paymentExtra.deposit") : ""}</div>
            </div>
            <input inputMode="decimal" placeholder="0,00" value={alloc[o.id] ?? ""} onChange={(e) => setAlloc({ ...alloc, [o.id]: e.target.value })}
              onFocus={() => { if (!alloc[o.id]) setAlloc({ ...alloc, [o.id]: String(Math.min(o.remaining, Math.max(rest, 0)).toFixed(2)) }); }}
              className="px-2 py-2 rounded-lg border border-input bg-card text-sm text-right" />
          </div>
        ))}
      </div>
      {manual.length > 0 && (
        <>
          <div className="text-xs font-medium mb-1">{t("bank.linkManual")}</div>
          <div className="space-y-1 mb-4">
            {manual.filter((m) => Math.abs(m.amount - tx.amount) < 0.01 || links.includes(m.id)).slice(0, 20).map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={links.includes(m.id)} onChange={(e) => setLinks(e.target.checked ? [...links, m.id] : links.filter((x) => x !== m.id))} className="w-4 h-4" />
                {guests.get(m.reservation_id) ?? "—"} · {formatDateDE(m.paid_on)} · {eur(m.amount)}
              </label>
            ))}
          </div>
        </>
      )}
      <div className={`text-sm flex justify-between ${rest < -0.004 ? "text-destructive" : ""}`}><span>{t("bank.unallocated")}</span><span className="font-semibold">{eur(rest, tx.currency)}</span></div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button onClick={onClose} className="py-3 rounded-xl border border-input">{t("common.cancel")}</button>
        <button disabled={busy} onClick={save} className="py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{t("bank.confirm")}</button>
      </div>
    </Sheet>
  );
}
