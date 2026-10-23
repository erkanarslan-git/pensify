import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Plus, Settings, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { businessDate } from "@/lib/business-time";
import { formatDateDE } from "@/lib/date-de";
import { buildReplacementSchedule, validReplacementSchedule, installmentState, type Installment, type InstallmentState } from "@/lib/payments";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/payments/")({
  head: () => ({ meta: [{ title: "Tahsilat — Pensify" }, { name: "description", content: "Uzun süreli konaklamalar için aylık ödeme planları ve ödemeyenler listesi." }, { property: "og:title", content: "Tahsilat — Pensify" }, { property: "og:description", content: "Uzun süreli konaklamalar için aylık ödeme planları ve ödemeyenler listesi." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PaymentsPage,
});

interface Res { id: string; guest_name: string; room_id: string; check_in: string; check_out: string; revenue: number; payer_ibans: string[] }
interface Sched { id: string; reservation_id: string; due_date: string; amount: number; payment_reference: string; hasPayments: boolean }
interface Pay { id: string; schedule_id: string | null; reservation_id: string; amount: number; paid_on: string; method: string; note: string | null; recorded_by: string | null; source: string; bank_transaction_id: string | null }
type Filter = "unpaid" | "overdue" | "all";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const stateCls: Record<InstallmentState, string> = {
  paid: "bg-success/15 text-success", partial: "bg-warning/15 text-warning", overdue: "bg-destructive/15 text-destructive", open: "bg-primary/10 text-primary",
};
const nights = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function PaymentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const perm = usePermissions();
  const today = businessDate();
  const month = today.slice(0, 7);
  const [filter, setFilter] = useState<Filter>("unpaid");
  const [paying, setPaying] = useState<Sched | null>(null);
  const [planning, setPlanning] = useState(false);

  const { data } = useQuery({
    queryKey: ["payments-page"],
    queryFn: async () => {
      const [s, p, r, rm, pr] = await Promise.all([
        supabase.from("payment_schedules").select("id,reservation_id,due_date,amount,payment_reference,payments(id)").order("due_date").limit(5000),
        supabase.from("payments").select("id,schedule_id,reservation_id,amount,paid_on,method,note,recorded_by,source,bank_transaction_id").is("reversed_at", null).order("paid_on", { ascending: false }).limit(5000),
        supabase.from("reservations").select("id,guest_name,room_id,check_in,check_out,revenue,status,payer_ibans").is("deleted_at", null).not("status", "in", "(cancelled,no_show)").limit(5000),
        supabase.from("rooms").select("id,number"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      const err = s.error ?? p.error ?? r.error;
      if (err) throw err;
      return {
        schedules: (s.data ?? []).map((x) => ({ ...x, amount: Number(x.amount), hasPayments: x.payments.length > 0 })) as Sched[],
        payments: (p.data ?? []).map((x) => ({ ...x, amount: Number(x.amount) })) as Pay[],
        reservations: (r.data ?? []).map((x) => ({ ...x, revenue: Number(x.revenue) })) as Res[],
        rooms: new Map((rm.data ?? []).map((x) => [x.id, x.number])),
        names: new Map((pr.data ?? []).map((x) => [x.id, x.full_name ?? ""])),
      };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["payments-page"] });

  const resMap = useMemo(() => new Map((data?.reservations ?? []).map((r) => [r.id, r])), [data]);
  const rows = useMemo(() => {
    const paidBy = new Map<string, number>();
    for (const p of data?.payments ?? []) if (p.schedule_id) paidBy.set(p.schedule_id, (paidBy.get(p.schedule_id) ?? 0) + p.amount);
    return (data?.schedules ?? []).filter((s) => resMap.has(s.reservation_id)).map((s) => {
      const paid = paidBy.get(s.id) ?? 0;
      return { ...s, paid, remaining: Math.max(0, s.amount - paid), state: installmentState(s.amount, paid, s.due_date, today), res: resMap.get(s.reservation_id)! };
    });
  }, [data, resMap, today]);

  const thisMonth = rows.filter((r) => r.due_date.slice(0, 7) === month);
  const stats = {
    due: thisMonth.reduce((a, r) => a + r.amount, 0),
    unpaid: thisMonth.filter((r) => r.state !== "paid").length,
    overdue: rows.filter((r) => r.state === "overdue").reduce((a, r) => a + r.remaining, 0),
    collected: (data?.payments ?? []).filter((p) => p.paid_on.slice(0, 7) === month).reduce((a, p) => a + p.amount, 0),
  };
  const shown = rows.filter((r) =>
    filter === "all" ? true : filter === "overdue" ? r.state === "overdue" : r.state !== "paid" && r.due_date.slice(0, 7) <= month,
  );

  return (
    <AppShell title={t("payments.title")} subtitle={t("payments.subtitle")}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat cls="brand-tile" label={t("payments.dueThisMonth")} value={eur(stats.due)} />
        <Stat cls="tile-warning" label={t("payments.unpaidThisMonth")} value={String(stats.unpaid)} onClick={() => setFilter("unpaid")} />
        <Stat cls="tile-destructive" label={t("payments.overdueTotal")} value={eur(stats.overdue)} onClick={() => setFilter("overdue")} />
        <Stat cls="tile-success" label={t("payments.collectedThisMonth")} value={eur(stats.collected)} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex gap-1 p-1 rounded-xl bg-muted">
          {(["unpaid", "overdue", "all"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {t(`payments.f${f[0].toUpperCase()}${f.slice(1)}`)}
            </button>
          ))}
        </div>
        <Link to="/payments/transactions" className="ml-auto inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-input bg-card text-sm"><Landmark className="w-4 h-4" />{t("bank.transactions")}</Link>
        {perm.can("manage_bank") && <Link to="/payments/bank" title={t("bank.settings")} aria-label={t("bank.settings")} className="inline-flex items-center px-3 py-2.5 rounded-xl border border-input bg-card"><Settings className="w-4 h-4" /></Link>}
        {perm.can("manage_payment_plans") && <Button onClick={() => setPlanning(true)}>
          <Plus className="w-4 h-4" />{t("payments.newPlan")}
        </Button>}
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border/60">
        {shown.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">{t("payments.empty")}</div>}
        {shown.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 sm:flex-1">
              <div className="font-semibold truncate">{r.res.guest_name} <span className="text-muted-foreground font-normal">· #{data?.rooms.get(r.res.room_id) ?? "—"}</span></div>
              <div className="text-xs text-muted-foreground">{t("payments.due")}: {formatDateDE(r.due_date)} · {t("payments.paid")}: {eur(r.paid)} · <span className="font-mono">{r.payment_reference}</span></div>
            </div>
            <div className="text-right sm:w-28">
              <div className="font-semibold tabular-nums">{eur(r.remaining || r.amount)}</div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${stateCls[r.state]}`}>{t(`payments.state.${r.state}`)}</span>
            </div>
            {(perm.can("collect_payments") || perm.can("correct_payments")) && (
              <Button variant={r.state === "paid" ? "outline" : "default"} onClick={() => setPaying(r)} className="col-span-2 sm:col-span-1">
                <Wallet className="w-4 h-4" />{t(r.state === "paid" || !perm.can("collect_payments") ? "payments.history" : "payments.takePayment")}
              </Button>
            )}
          </div>
        ))}
      </div>

      {paying && (
        <PayDialog sched={paying} guest={resMap.get(paying.reservation_id)?.guest_name ?? ""}
          remaining={rows.find((r) => r.id === paying.id)?.remaining ?? paying.amount}
          history={(data?.payments ?? []).filter((p) => p.schedule_id === paying.id)} names={data?.names ?? new Map()}
          onClose={() => setPaying(null)} onDone={refresh} />
      )}
      {planning && (
        <PlanDialog reservations={(data?.reservations ?? []).filter((r) => nights(r.check_in, r.check_out) >= 28 && r.check_out > today)}
          rooms={data?.rooms ?? new Map()} schedules={data?.schedules ?? []}
          onClose={() => setPlanning(false)} onDone={refresh} />
      )}
    </AppShell>
  );
}

function Stat({ cls, label, value, onClick }: { cls: string; label: string; value: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={`${cls} rounded-2xl px-4 py-4 text-left shadow-sm`}>
      <div className="text-xs opacity-85">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-base";

function PayDialog({ sched, guest, remaining, history, names, onClose, onDone }: {
  sched: Sched; guest: string; remaining: number; history: Pay[]; names: Map<string, string>; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const perm = usePermissions();
  const [amount, setAmount] = useState(String(remaining.toFixed(2)));
  const [date, setDate] = useState(businessDate());
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const reverse = async () => {
    if (!reversing || busy || !perm.can("correct_payments") || reason.trim().length < 3) return;
    setBusy(true);
    const { error } = await supabase.rpc("reverse_manual_payment", { _id: reversing, _reason: reason.trim() });
    setBusy(false);
    if (error) return toast.error(t("payments.saveErr"));
    toast.success(t("payments.reversed")); onDone(); onClose();
  };
  const save = async () => {
    if (!perm.can("collect_payments") || busy) return;
    const a = Number(amount.replace(",", "."));
    if (!(a > 0) || !date) return toast.error(t("payments.invalid"));
    setBusy(true);
    const { error } = await supabase.from("payments").insert({ reservation_id: sched.reservation_id, schedule_id: sched.id, amount: a, paid_on: date, method, note: note.trim() || null } as never);
    setBusy(false);
    if (error) return toast.error(t("payments.saveErr"));
    toast.success(t("payments.saved")); onDone(); onClose();
  };
  return (
    <Modal title={t("payments.payTitle", { guest })} onClose={onClose}>
      <div className="text-sm text-muted-foreground mb-3">{t("payments.due")}: {formatDateDE(sched.due_date)} · {t("payments.remaining")}: {eur(remaining)}</div>
      {perm.can("collect_payments") && remaining > 0 && <>
      <label className="text-xs text-muted-foreground">{t("payments.amount")}</label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
      <label className="text-xs text-muted-foreground mt-3 block">{t("payments.payDate")}</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      <label className="text-xs text-muted-foreground mt-3 block">{t("payments.method")}</label>
      <div className="grid grid-cols-4 gap-2 mt-1">
        {["cash", "transfer", "card", "other"].map((m) => (
          <button key={m} onClick={() => setMethod(m)} className={`py-2.5 rounded-lg border text-sm ${method === m ? "border-primary bg-primary/10 text-primary font-medium" : "border-input"}`}>{t(`payments.methods.${m}`)}</button>
        ))}
      </div>
      <label className="text-xs text-muted-foreground mt-3 block">{t("payments.note")}</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </>}
      {history.length > 0 && (
        <div className="mt-4 text-xs">
          <div className="font-medium mb-1">{t("payments.history")}</div>
          {history.map((p) => (
            <div key={p.id} className="flex justify-between py-1 border-t border-border/60">
              <span>{formatDateDE(p.paid_on)} · {t(`payments.methods.${p.method}`)}{p.note ? ` · ${p.note}` : ""}</span>
              <span>{eur(p.amount)} · {t("payments.recordedBy")}: {p.recorded_by ? names.get(p.recorded_by) || "—" : "—"}</span>
              {perm.can("correct_payments") && p.source === "manual" && !p.bank_transaction_id && <Button variant="ghost" size="sm" onClick={() => { setReversing(p.id); setReason(""); }}>{t("payments.reverse")}</Button>}
            </div>
          ))}
        </div>
      )}
      {reversing && <div className="mt-4 space-y-2">
        <label htmlFor="payment-reversal-reason" className="text-sm">{t("payments.reverseReason")}</label>
        <textarea id="payment-reversal-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={reverse}>{t("payments.confirmReverse")}</Button>
      </div>}
      <div className="grid grid-cols-2 gap-2 mt-5">
        <button onClick={onClose} className="py-3 rounded-xl border border-input">{t("common.cancel")}</button>
        {perm.can("collect_payments") && remaining > 0 && <Button disabled={busy} onClick={save}>{t("payments.save")}</Button>}
      </div>
    </Modal>
  );
}

function PlanDialog({ reservations, rooms, schedules, onClose, onDone }: {
  reservations: Res[]; rooms: Map<string, string>; schedules: Sched[]; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [resId, setResId] = useState("");
  const [dueDay, setDueDay] = useState(1);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [monthly, setMonthly] = useState("");
  const [rows, setRows] = useState<Installment[]>([]);
  const [busy, setBusy] = useState(false);
  const [ibans, setIbans] = useState("");
  const res = reservations.find((r) => r.id === resId);
  const retained = schedules.filter((s) => s.reservation_id === resId && s.hasPayments);

  const regenerate = (id = resId, day = dueDay, m = mode, mon = monthly) => {
    const r = reservations.find((x) => x.id === id);
    if (!r) return setRows([]);
    setRows(buildReplacementSchedule({ checkIn: r.check_in, checkOut: r.check_out, dueDay: day, total: r.revenue, monthly: m === "manual" ? Number(mon.replace(",", ".")) || 0 : undefined }, schedules.filter((s) => s.reservation_id === id && s.hasPayments)));
  };

  const save = async () => {
    if (busy || !res) return;
    if (!validReplacementSchedule(rows, retained)) return toast.error(t("payments.invalid"));
    setBusy(true);
    const current = await supabase.from("payment_schedules").select("id,due_date,amount,payments(id)").eq("reservation_id", res.id);
    if (current.error) { setBusy(false); return toast.error(t("payments.saveErr")); }
    const protectedRows = current.data.filter((s) => s.payments.length > 0);
    if (!validReplacementSchedule(rows, protectedRows.map((s) => ({ due_date: s.due_date, amount: Number(s.amount) }))) ||
      protectedRows.length !== retained.length || protectedRows.some((s) => !retained.some((r) => r.id === s.id && r.due_date === s.due_date && r.amount === Number(s.amount)))) {
      setBusy(false); onDone(); return toast.error(t("payments.invalid"));
    }
    const removable = current.data.filter((s) => s.payments.length === 0).map((s) => s.id);
    const ibanList = ibans.split(/[,;\n]/).map((x) => x.replace(/\s+/g, "").toUpperCase()).filter(Boolean);
    const { error: payerError } = await supabase.rpc("save_reservation_payer_ibans", { _reservation: res.id, _ibans: ibanList });
    if (payerError) { setBusy(false); return toast.error(t("payments.saveErr")); }
    if (removable.length) {
      const { error } = await supabase.from("payment_schedules").delete().in("id", removable);
      if (error) { setBusy(false); return toast.error(t("payments.saveErr")); }
    }
    const { error } = rows.length ? await supabase.from("payment_schedules").insert(rows.map((r) => ({ reservation_id: res.id, due_date: r.due_date, amount: r.amount })) as never) : { error: null };
    setBusy(false);
    if (error) return toast.error(t("payments.saveErr"));
    toast.success(t("payments.planSaved")); onDone(); onClose();
  };

  const total = [...retained, ...rows].reduce((a, r) => a + (r.amount || 0), 0);
  return (
    <Modal title={t("payments.newPlan")} onClose={onClose}>
      <label className="text-xs text-muted-foreground">{t("payments.reservation")}</label>
      <select value={resId} onChange={(e) => { setResId(e.target.value); setIbans((reservations.find((r) => r.id === e.target.value)?.payer_ibans ?? []).join(", ")); regenerate(e.target.value); }} className={inputCls}>
        <option value="">{t("payments.pickReservation")}</option>
        {reservations.map((r) => (
          <option key={r.id} value={r.id}>{r.guest_name} · #{rooms.get(r.room_id) ?? "—"} · {formatDateDE(r.check_in)}–{formatDateDE(r.check_out)} · {eur(r.revenue)}</option>
        ))}
      </select>
      <div className="text-xs text-muted-foreground mt-1">{t("payments.onlyLong")}</div>

      <label className="text-xs text-muted-foreground mt-3 block">{t("bank.payerIbans")}</label>
      <input value={ibans} onChange={(e) => setIbans(e.target.value)} placeholder="DE89 3704 0044 0532 0130 00" className={inputCls} />
      <div className="text-xs text-muted-foreground mt-1">{t("bank.payerIbansHint")}</div>
      <label className="text-xs text-muted-foreground mt-3 block">{t("payments.dueDay")}</label>
      <select value={dueDay} onChange={(e) => { const d = Number(e.target.value); setDueDay(d); regenerate(resId, d); }} className={inputCls}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}.</option>)}
      </select>

      <label className="text-xs text-muted-foreground mt-3 block">{t("payments.mode")}</label>
      <div className="grid grid-cols-2 gap-2 mt-1">
        {(["auto", "manual"] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); regenerate(resId, dueDay, m); }} className={`py-2.5 px-2 rounded-lg border text-sm ${mode === m ? "border-primary bg-primary/10 text-primary font-medium" : "border-input"}`}>{t(`payments.${m}`)}</button>
        ))}
      </div>
      {mode === "manual" && (
        <>
          <label className="text-xs text-muted-foreground mt-3 block">{t("payments.monthly")}</label>
          <input inputMode="decimal" value={monthly} onChange={(e) => { setMonthly(e.target.value); regenerate(resId, dueDay, "manual", e.target.value); }} className={inputCls} />
        </>
      )}

      {res && (
        <div className="mt-4">
          <div className="text-xs font-medium mb-1">{t("payments.preview")}</div>
          {retained.map((r) => (
            <div key={r.id} className="flex justify-between gap-2 mb-2 text-sm text-muted-foreground">
              <span>{formatDateDE(r.due_date)} · {t("payments.history")}</span><span>{eur(r.amount)}</span>
            </div>
          ))}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
              <input type="date" value={r.due_date} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, due_date: e.target.value } : x))} className="px-2 py-2 rounded-lg border border-input bg-card text-sm" />
              <input inputMode="decimal" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount: Number(e.target.value.replace(",", ".")) } : x))} className="px-2 py-2 rounded-lg border border-input bg-card text-sm" />
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="px-2 text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => setRows([...rows, { due_date: res.check_in, amount: 0 }])} className="text-sm text-primary inline-flex items-center gap-1"><Plus className="w-4 h-4" />{t("payments.addRow")}</button>
          <div className="text-sm mt-2 flex justify-between"><span>{t("payments.total")}</span><span className="font-semibold">{eur(total)}</span></div>
          <div className="text-xs text-muted-foreground mt-2">{t("payments.planReplaceNote")}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-5">
        <button onClick={onClose} className="py-3 rounded-xl border border-input">{t("common.cancel")}</button>
        <button disabled={busy || !res} onClick={save} className="py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{t("payments.save")}</button>
      </div>
    </Modal>
  );
}
