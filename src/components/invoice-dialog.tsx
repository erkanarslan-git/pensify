import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Printer, Mail, Trash2, Ban } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { promptAction } from "@/components/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessDate } from "@/lib/business-time";
import { formatDateDE } from "@/lib/date-de";
import { isOpenEndedCheckOut } from "@/lib/open-stay";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
import { invoiceTotals, nextInvoiceNumber, printInvoice, invoiceMailto, dueDateOf, type InvoiceItem, type InvoiceDoc, type InvoiceIssuer } from "@/lib/invoice";

export interface InvoiceReservation { id: string; booking_number?: number | null; guest_name: string; guest_email: string | null; company_name: string | null; check_in: string; check_out: string; revenue: number; room: string; payment_method?: string | null }
interface Article { id: string; article_no: string; description: string; unit: string; unit_price: number; vat_rate: number }
interface Saved { id: string; invoice_number: string; issue_date: string; recipient_name: string; recipient_address: string | null; recipient_email: string | null; items: InvoiceItem[]; net_total: number; vat_total: number; gross_total: number; issuer: InvoiceIssuer; note: string | null; sent_at: string | null; prices_net?: boolean; booking_number?: number | null; cancelled_at?: string | null; cancel_reason?: string | null; customer_number?: string | null; payment_method?: string | null; payment_terms?: string | null; due_date?: string | null }

const nightsOf = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export function InvoiceDialog({ open, onOpenChange, reservation }: { open: boolean; onOpenChange: (o: boolean) => void; reservation: InvoiceReservation }) {
  const { t, i18n } = useTranslation();
  const [payMethod, setPayMethod] = useState<string>(""); const [terms, setTerms] = useState(""); const [dueDays, setDueDays] = useState(0); const [due, setDue] = useState("");
  const [articles, setArticles] = useState<Article[]>([]); const [custNo, setCustNo] = useState<string | null>(null);
  const [list, setList] = useState<Saved[]>([]);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(businessDate());
  const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [email, setEmail] = useState(""); const [note, setNote] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [pricesNet, setPricesNet] = useState(false);
  const perms = usePermissions();
  const bn = reservation.booking_number ? `B-${reservation.booking_number}` : "";
  const openEnded = isOpenEndedCheckOut(reservation.check_out);
  const stay = `${formatDateDE(reservation.check_in)} – ${formatDateDE(reservation.check_out)}`;

  const load = async () => {
    const [{ data: inv }, { data: org }] = await Promise.all([
      supabase.from("invoices").select("*").eq("reservation_id", reservation.id).order("created_at", { ascending: false }),
      supabase.rpc("active_organization_id"),
    ]);
    setList((inv ?? []) as unknown as Saved[]);
    const { data: s } = org ? await supabase.from("invoice_settings").select("vat_rate,number_format,next_number,number_year,payment_terms,payment_due_days").eq("organization_id", org).maybeSingle() : { data: null };
    const settings = s ?? { vat_rate: 7, number_format: "{YYYY}-{NNNN}", next_number: 1, number_year: null, payment_terms: "Zahlbar sofort nach Erhalt der Rechnung ohne Abzug.", payment_due_days: 0 };
    setTerms(settings.payment_terms ?? ""); setDueDays(settings.payment_due_days ?? 0); setDue(dueDateOf(businessDate(), settings.payment_due_days ?? 0));
    setPayMethod(reservation.payment_method ?? "");
    if (org) { const { data: a } = await supabase.from("invoice_articles").select("id,article_no,description,unit,unit_price,vat_rate").eq("organization_id", org).eq("active", true).order("article_no"); setArticles((a ?? []) as Article[]); }
    setNumber(nextInvoiceNumber(settings, Number(businessDate().slice(0, 4))));
    const n = openEnded ? 1 : nightsOf(reservation.check_in, reservation.check_out);
    setPricesNet(false);
    setItems([{ article_no: "UEB", description: `Übernachtung Zimmer ${reservation.room}\nAufenthaltszeitraum: ${stay}${bn ? `\nBuchungs-Nr.: ${bn}` : ""}`, unit: openEnded ? "Monat" : "Nächte", quantity: n, unit_price: Math.round((Number(reservation.revenue) / n) * 100) / 100, vat_rate: Number(settings.vat_rate) }]);
  };
  useEffect(() => {
    if (!open) return;
    setName(reservation.company_name || reservation.guest_name); setEmail(reservation.guest_email ?? ""); setAddress(""); setNote(""); setDate(businessDate());
    void load();
  }, [open, reservation.id]);

  useEffect(() => {
    if (!open) return;
    const key = (email.trim() || name.trim().replace(/\s+/g, " ")).toLowerCase();
    if (!key) return setCustNo(null);
    const h = setTimeout(async () => { const { data } = await supabase.from("invoice_customers").select("customer_number").eq("match_key", key).maybeSingle(); setCustNo(data?.customer_number ?? null); }, 300);
    return () => clearTimeout(h);
  }, [open, name, email]);
  const totals = invoiceTotals(items, pricesNet);
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems((x) => x.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const docOf = (s: Saved): InvoiceDoc => ({ ...s, items: s.items, stay, booking_number: s.booking_number ?? reservation.booking_number ?? null });

  const create = async () => {
    if (!name.trim()) return toast.error(t("invoice.errRecipient"));
    if (!items.length || items.some((x) => !x.description.trim() || x.quantity <= 0)) return toast.error(t("invoice.errItems"));
    setBusy(true);
    const { data: id, error } = await supabase.rpc("create_invoice_v2", { _reservation: reservation.id, _number: number, _issue_date: date, _recipient_name: name, _recipient_address: address, _recipient_email: email, _items: items as never, _note: note || undefined, _prices_net: pricesNet, _payment_method: payMethod || undefined, _payment_terms: terms || undefined, _due_date: due || undefined });
    setBusy(false);
    if (error) return toast.error(error.message.includes("exists") ? t("invoice.errNumber") : t("invoice.failed"));
    toast.success(t("invoice.created"));
    await load();
    const { data } = await supabase.from("invoices").select("*").eq("id", id as string).maybeSingle();
    if (data) printInvoice(docOf(data as unknown as Saved));
  };

  const cancel = async (s: Saved) => {
    const reason = await promptAction({ description: `Storno ${s.invoice_number}`, destructive: true });
    if (!reason) return;
    const { error } = await supabase.rpc("cancel_invoice", { _invoice: s.id, _reason: reason });
    if (error) return toast.error(error.message);
    void load();
  };
  const addPreset = (kind: "tax" | "cleaning" | "breakfast" | "parking") => {
    const vat = items[0]?.vat_rate ?? 7;
    if (kind === "tax") {
      const base = items[0] ? Math.round(items[0].quantity * items[0].unit_price * 100) / 100 : 0;
      return setItems((x) => [...x, { article_no: "BHST", description: "Beherbergungssteuer (3,5 % des Übernachtungspreises)", quantity: 1, unit: "Stk.", unit_price: Math.round(base * 3.5) / 100, vat_rate: vat }]);
    }
    const label = { cleaning: "Endreinigung", breakfast: "Frühstück", parking: "Parkplatz" }[kind];
    const art = { cleaning: "REIN", breakfast: "FRUE", parking: "PARK" }[kind];
    setItems((x) => [...x, { article_no: art, description: label, quantity: 1, unit: "Stk.", unit_price: 0, vat_rate: 19 }]);
  };

  const send = async (s: Saved) => {
    const to = s.recipient_email || email;
    if (!to) return toast.error(t("invoice.errEmail"));
    printInvoice(docOf(s));
    window.location.href = invoiceMailto(docOf(s), to);
    await supabase.rpc("mark_invoice_sent", { _invoice: s.id }); void load();
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{t("invoice.title")}</DialogTitle><DialogDescription>{reservation.guest_name} · {stay}</DialogDescription></DialogHeader>
      {list.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("invoice.existing")}</h3>
        {list.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className="font-medium">{s.invoice_number}</span><span className="text-muted-foreground">{formatDateDE(s.issue_date)} · {eur(Number(s.gross_total))}</span>
          {s.sent_at && <span className="text-xs text-muted-foreground">{t("invoice.sent")}</span>}
          {s.cancelled_at && <span className="text-xs font-semibold text-destructive" title={s.cancel_reason ?? ""}>STORNO</span>}
          <span className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => printInvoice(docOf(s))}><Printer className="mr-1 h-4 w-4" />PDF</Button>
          <Button size="sm" variant="outline" onClick={() => send(s)}><Mail className="mr-1 h-4 w-4" />{t("invoice.email")}</Button>
          {perms.isAdmin && !s.cancelled_at && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel(s)}><Ban className="mr-1 h-4 w-4" />Storno</Button>}
        </div>)}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.number")}</span><Input value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.date")}</span><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value) setDue(dueDateOf(e.target.value, dueDays)); }} /></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.recipient")}</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("common.email")}</span><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2"><span className="text-xs text-muted-foreground">{t("invoice.address")}</span><textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-md border border-input bg-card p-2" /></label>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_4rem_5.5rem_3.5rem_2rem] gap-2 text-xs text-muted-foreground"><span>{t("invoice.articleNo")}</span><span>{t("invoice.description")}</span><span>{t("invoice.qty")}</span><span>{t("invoice.unit")}</span><span>{t("invoice.price")}</span><span>{t("invoice.vat")}</span><span /></div>
        {items.map((it, i) => <div key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_4rem_5.5rem_3.5rem_2rem] gap-2">
          <Input value={it.article_no ?? ""} maxLength={30} onChange={(e) => setItem(i, { article_no: e.target.value })} />
          <textarea rows={Math.min(4, it.description.split("\n").length)} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} className="rounded-md border border-input bg-card px-2 py-1.5 text-sm" />
          <Input type="number" min={0} step="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: +e.target.value || 0 })} />
          <Input value={it.unit ?? ""} maxLength={20} onChange={(e) => setItem(i, { unit: e.target.value })} />
          <Input type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: +e.target.value || 0 })} />
          <Input type="number" min={0} max={100} step="1" value={it.vat_rate} onChange={(e) => setItem(i, { vat_rate: +e.target.value || 0 })} />
          <Button type="button" variant="ghost" size="icon" aria-label={t("invoice.removeLine")} onClick={() => setItems((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
        <Button type="button" variant="ghost" size="sm" onClick={() => setItems((x) => [...x, { article_no: "", description: "", quantity: 1, unit: "Stk.", unit_price: 0, vat_rate: x[0]?.vat_rate ?? 7 }])}><Plus className="mr-1 h-4 w-4" />{t("invoice.addLine")}</Button>
        <div className="flex flex-wrap gap-1.5">
          {articles.map((a) => <Button key={a.id} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setItems((x) => [...x, { article_no: a.article_no, description: a.description, quantity: 1, unit: a.unit, unit_price: Number(a.unit_price), vat_rate: Number(a.vat_rate) }])}>+ {a.article_no} {a.description.split("\n")[0]}</Button>)}
          {([["tax", "+ Beherbergungssteuer"], ["cleaning", "+ Endreinigung"], ["breakfast", "+ Frühstück"], ["parking", "+ Parkplatz"]] as const).map(([k, l]) => <Button key={k} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addPreset(k)}>{l}</Button>)}
        </div>
        <div role="radiogroup" className="inline-flex rounded-md bg-muted p-1 text-xs">
          {([[false, "Preise brutto (inkl. MwSt.)"], [true, "Preise netto (zzgl. MwSt.)"]] as const).map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={pricesNet === v} onClick={() => setPricesNet(v)} className={`rounded px-2.5 py-1 ${pricesNet === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l}</button>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.customerNo")}</span><span className="py-2 font-medium">{custNo ?? t("invoice.customerNoNew")}</span></div>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.paymentMethod")}</span>
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2">
            <option value="">{paymentMethodLabel(null, i18n.language)}</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{paymentMethodLabel(m, i18n.language)}</option>)}
          </select></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.dueDate")}</span><Input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="grid gap-1 text-sm sm:col-span-3"><span className="text-xs text-muted-foreground">{t("invoice.paymentTerms")}</span><Input value={terms} maxLength={500} onChange={(e) => setTerms(e.target.value)} /></label>
      </div>
      <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.note")}</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border border-input bg-card p-2" /></label>
      <div className="text-right text-sm"><div className="text-muted-foreground">{t("invoice.net")}: {eur(totals.net)} · {t("invoice.vat")}: {eur(totals.vat)}</div><div className="text-base font-semibold">{t("invoice.total")}: {eur(totals.gross)}</div></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
        <Button disabled={busy} onClick={create}>{t("invoice.create")}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
