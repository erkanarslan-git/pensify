import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
interface Sched { kind: string; paid: number; id: string; reservation_id: string; due_date: string; amount: number; payment_reference: string; hasPayments: boolean }
interface Pay { kind: string; reversed_at: string | null; id: string; schedule_id: string | null; reservation_id: string; amount: number; paid_on: string; method: string; note: string | null; recorded_by: string | null; source: string; bank_transaction_id: string | null }
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
  const [search,setSearch] = useState(""); const [debounced,setDebounced] = useState(""); const [page,setPage] = useState(0); const [size,setSize] = useState(20);
  useEffect(()=>{const timer=setTimeout(()=>{setDebounced(search);setPage(0);},300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>setPage(0),[filter]);


  const { data, isPending, isError } = useQuery({
    queryKey: ["payments-page",debounced,filter,page,size],
    queryFn: async () => {
      const [result, rm, pr] = await Promise.all([
        supabase.rpc("finance_installment_page", { _today: today, _search:debounced, _filter:filter, _page:page, _size:size }),
        supabase.from("rooms").select("id,number"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      if (result.error) throw result.error;
      const value = result.data as unknown as { total:number; schedules: Sched[]; payments: Pay[]; reservations: Res[]; stats: { due: number; unpaid: number; overdue: number; collected: number; unallocated: number; deposit: number } };
      return { ...value, reservations: value.reservations.map(r => ({ ...r, payer_ibans: r.payer_ibans ?? [] })), rooms: new Map((rm.data ?? []).map(x => [x.id,x.number])), names: new Map((pr.data ?? []).map(x => [x.id,x.full_name ?? ""])) };
    },
  });
  const refresh = async () => { await Promise.all([qc.invalidateQueries({queryKey:["payments-page"]}),qc.invalidateQueries({queryKey:["payment-plan-context"]}),qc.invalidateQueries({queryKey:["payment-reservation-context"]})]); };

  const resMap = useMemo(() => new Map((data?.reservations ?? []).map((r) => [r.id, r])), [data]);
  const rows = useMemo(() => {
    return (data?.schedules ?? []).flatMap(s => {
      const res = resMap.get(s.reservation_id); if (!res) return [];
      const paid = Number(s.paid); return [{ ...s, amount: Number(s.amount), paid, remaining: Math.max(0,Number(s.amount)-paid), state: installmentState(Number(s.amount),paid,s.due_date,today),res }];
    });
  }, [data, resMap, today]);

  const stats = data?.stats ?? { due: 0, unpaid: 0, overdue: 0, collected: 0, unallocated: 0, deposit: 0 };
  const shown = rows;

  return (
    <AppShell title={t("payments.title")} subtitle={t("payments.subtitle")}>
      {isError&&<p role="alert">{t("payments.saveErr")}</p>}{isPending&&<p>{t("common.loading")}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat cls="brand-tile" label={t("payments.dueThisMonth")} value={eur(stats.due)} />
        <Stat cls="tile-warning" label={t("payments.unpaidThisMonth")} value={String(stats.unpaid)} onClick={() => setFilter("unpaid")} />
        <Stat cls="tile-destructive" label={t("payments.overdueTotal")} value={eur(stats.overdue)} onClick={() => setFilter("overdue")} />
        <Stat cls="tile-success" label={t("payments.collectedThisMonth")} value={eur(stats.collected)} />
      </div>

      <div className="flex gap-5 mb-4 text-sm"><span>{t("paymentExtra.unallocated")}: {eur(stats.unallocated)}</span><span>{t("paymentExtra.deposit")}: {eur(stats.deposit)}</span></div>
      <input aria-label={t("guests.search")} placeholder={t("guests.search")} value={search} onChange={e=>setSearch(e.target.value)} maxLength={120} className="mb-3 w-full max-w-md rounded-md border border-input bg-card p-2 text-sm" />
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
              <div className="font-semibold tabular-nums">{eur(r.remaining)}</div>
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

      <div className="flex flex-wrap gap-3 items-center my-4"><span className="text-sm">{data?.total??0} · {t("guests.page")} {page+1}</span><select aria-label={t("guests.page")} value={size} onChange={e=>{setSize(Number(e.target.value));setPage(0);}} className="border border-input bg-card rounded-md p-2">{[10,20,30,40,50].map(n=><option key={n}>{n}</option>)}</select><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{t("guests.previous")}</Button><Button variant="outline" disabled={(page+1)*size>=(data?.total??0)} onClick={()=>setPage(p=>p+1)}>{t("guests.next")}</Button></div>
      {paying && (
        <PayDialog sched={paying} guest={resMap.get(paying.reservation_id)?.guest_name ?? ""}
          remaining={rows.find((r) => r.id === paying.id)?.remaining ?? paying.amount}
          history={(data?.payments ?? []).filter((p) => p.schedule_id === paying.id)} names={data?.names ?? new Map()}
          onClose={() => setPaying(null)} onDone={refresh} />
      )}
      {planning && (
        <PlanDialog rooms={data?.rooms ?? new Map()}
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
  const [allocations,setAllocations]=useState<Record<string,string>>({[sched.id]:String(remaining)});
  const contextQuery=useQuery({queryKey:["payment-reservation-context",sched.reservation_id],queryFn:async()=>{const result=await supabase.rpc("payment_reservation_context",{_reservation:sched.reservation_id});if(result.error)throw result.error;return result.data as unknown as {schedules:Sched[];payments:Pay[]};}});
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
    const chosen=Object.entries(allocations).map(([schedule_id,value])=>({schedule_id,amount:Math.round(Number(value.replace(",","."))*100)/100})).filter(x=>x.amount>0);
    if(chosen.reduce((sum,x)=>sum+Math.round(x.amount*100),0)>Math.round(a*100)){setBusy(false);return toast.error(t("payments.invalid"));}
    const payload={_reservation:sched.reservation_id,_amount:a,_date:date,_method:method,_note:note.trim(),_kind:sched.kind === "deposit" ? "deposit" : "rent",_allocations:chosen};
    const key=`pensify-payment-retry:${sched.reservation_id}`;
    const previous=sessionStorage.getItem(key); let requestId:string=crypto.randomUUID();
    if(previous){try{const saved=JSON.parse(previous) as {id:string;payload:string};if(saved.payload!==JSON.stringify(payload)){setBusy(false);return toast.error(t("paymentExtra.retrySame"));}requestId=saved.id;}catch{setBusy(false);return toast.error(t("paymentExtra.retrySame"));}}
    sessionStorage.setItem(key,JSON.stringify({id:requestId,payload:JSON.stringify(payload)}));
    const { error } = await supabase.rpc("collect_payment_receipt", { _request_id:requestId,...payload });
    if(!error)sessionStorage.removeItem(key);
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
      <h3 className="mt-4 text-sm font-semibold">{t("paymentExtra.allocations")}</h3>
      {(contextQuery.data?.schedules??[sched]).filter(s=>(s.kind==="deposit")===(sched.kind==="deposit")&&Number(s.amount)>Number(s.paid)).map(s=><label key={s.id} className="flex gap-2 items-center text-xs mt-2"><span className="flex-1">{formatDateDE(s.due_date)} · {eur(Number(s.amount)-Number(s.paid))}</span><input aria-label={`${t("payments.amount")} ${s.due_date}`} inputMode="decimal" value={allocations[s.id]??""} onChange={e=>setAllocations(values=>({...values,[s.id]:e.target.value}))} className="w-24 rounded-md border border-input bg-card p-2" /></label>)}
      <p className="text-xs text-muted-foreground mt-2">{t("paymentExtra.excess")}</p>
      <label className="text-xs text-muted-foreground mt-3 block">{t("payments.note")}</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </>}
      {history.length > 0 && (
        <div className="mt-4 text-xs">
          <div className="font-medium mb-1">{t("payments.history")}</div>
          {history.map((p) => (
            <div key={p.id} className="flex justify-between py-1 border-t border-border/60">
              <span>{p.reversed_at ? `${t("paymentExtra.reversed")} · ` : ""}{formatDateDE(p.paid_on)} · {t(`payments.methods.${p.method}`)}{p.note ? ` · ${p.note}` : ""}</span>
              <span>{eur(p.amount)} · {t("payments.recordedBy")}: {p.recorded_by ? names.get(p.recorded_by) || "—" : "—"}</span>
              {perm.can("correct_payments") && p.source === "manual" && !p.bank_transaction_id && !p.reversed_at && <Button variant="ghost" size="sm" onClick={() => { setReversing(p.id); setReason(""); }}>{t("payments.reverse")}</Button>}
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

function PlanDialog({ rooms, onClose, onDone }: {
  rooms: Map<string, string>; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [resId, setResId] = useState("");
  const [candidateSearch,setCandidateSearch]=useState(""); const [candidatePage,setCandidatePage]=useState(0);
  const candidates=useQuery({queryKey:["payment-plan-context",candidateSearch,candidatePage],queryFn:async()=>{const r=await supabase.rpc("finance_plan_candidates",{_today:businessDate(),_search:candidateSearch,_page:candidatePage,_size:20});if(r.error)throw r.error;return r.data as unknown as {total:number;rows:Res[]};}});
  const reservations=candidates.data?.rows??[];
  const contextQuery=useQuery({queryKey:["payment-reservation-context",resId],enabled:!!resId,queryFn:async()=>{const r=await supabase.rpc("payment_reservation_context",{_reservation:resId});if(r.error)throw r.error;return r.data as unknown as {schedules:Sched[]};}});
  const schedules=contextQuery.data?.schedules??[];

  const [dueDay, setDueDay] = useState(1);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [monthly, setMonthly] = useState("");
  const [rows, setRows] = useState<Installment[]>([]);
  const [busy, setBusy] = useState(false);
  const [ibans, setIbans] = useState("");
  const res = reservations.find((r) => r.id === resId);
  const retained = schedules.filter((s) => s.reservation_id === resId && s.kind === "rent" && s.hasPayments);

  const regenerate = (id = resId, day = dueDay, m = mode, mon = monthly) => {
    const r = reservations.find((x) => x.id === id);
    if (!r) return setRows([]);
    setRows(buildReplacementSchedule({ checkIn: r.check_in, checkOut: r.check_out, dueDay: day, total: r.revenue, monthly: m === "manual" ? Number(mon.replace(",", ".")) || 0 : undefined }, schedules.filter((s) => s.reservation_id === id && s.kind === "rent" && s.hasPayments)));
  };

  useEffect(()=>{if(resId&&contextQuery.data)regenerate();},[resId,contextQuery.data]);
  const save = async () => {
    if (busy || !res || !contextQuery.data) return;
    if (!validReplacementSchedule(rows, retained)) return toast.error(t("payments.invalid"));
    setBusy(true);
    const ibanList = ibans.split(/[,;\n]/).map(x => x.replace(/\s+/g, "").toUpperCase()).filter(Boolean);
    const { error } = await supabase.rpc("replace_payment_plan", { _reservation: res.id, _rows: rows.map(r => ({ due_date:r.due_date,amount:r.amount })), _retained: retained.map(r => ({ id:r.id,due_date:r.due_date,amount:r.amount })), _ibans: ibanList });
    setBusy(false);
    if (error) return toast.error(t("payments.saveErr"));
    toast.success(t("payments.planSaved")); onDone(); onClose();
  };

  const total = [...retained, ...rows].reduce((a, r) => a + (r.amount || 0), 0);
  return (
    <Modal title={t("payments.newPlan")} onClose={onClose}>
      <input aria-label={t("guests.search")} placeholder={t("guests.search")} value={candidateSearch} maxLength={120} onChange={e=>{setCandidateSearch(e.target.value);setCandidatePage(0);setResId("");setRows([]);}} className={inputCls}/>
      <div className="flex gap-2 my-2"><Button variant="outline" disabled={candidatePage===0} onClick={()=>{setCandidatePage(p=>p-1);setResId("");setRows([]);}}>{t("guests.previous")}</Button><span>{candidatePage+1}</span><Button variant="outline" disabled={(candidatePage+1)*20>=(candidates.data?.total??0)} onClick={()=>{setCandidatePage(p=>p+1);setResId("");setRows([]);}}>{t("guests.next")}</Button></div>
      {(candidates.isPending||contextQuery.isFetching)&&<p>{t("common.loading")}</p>}{(candidates.isError||contextQuery.isError)&&<p role="alert">{t("payments.saveErr")}</p>}
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
        <button disabled={busy || !res || !contextQuery.data} onClick={save} className="py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{t("payments.save")}</button>
      </div>
    </Modal>
  );
}
