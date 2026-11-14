import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Printer, Mail, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessDate } from "@/lib/business-time";
import { formatDateDE } from "@/lib/date-de";
import { invoiceTotals, nextInvoiceNumber, printInvoice, invoiceMailto, type InvoiceItem, type InvoiceDoc, type InvoiceIssuer } from "@/lib/invoice";

export interface InvoiceReservation { id: string; guest_name: string; guest_email: string | null; company_name: string | null; check_in: string; check_out: string; revenue: number; room: string }
interface Saved { id: string; invoice_number: string; issue_date: string; recipient_name: string; recipient_address: string | null; recipient_email: string | null; items: InvoiceItem[]; net_total: number; vat_total: number; gross_total: number; issuer: InvoiceIssuer; note: string | null; sent_at: string | null }

const nightsOf = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export function InvoiceDialog({ open, onOpenChange, reservation }: { open: boolean; onOpenChange: (o: boolean) => void; reservation: InvoiceReservation }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Saved[]>([]);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(businessDate());
  const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [email, setEmail] = useState(""); const [note, setNote] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [busy, setBusy] = useState(false);
  const stay = `${formatDateDE(reservation.check_in)} – ${formatDateDE(reservation.check_out)}`;

  const load = async () => {
    const [{ data: inv }, { data: org }] = await Promise.all([
      supabase.from("invoices").select("*").eq("reservation_id", reservation.id).order("created_at", { ascending: false }),
      supabase.rpc("active_organization_id"),
    ]);
    setList((inv ?? []) as unknown as Saved[]);
    const { data: s } = org ? await supabase.from("invoice_settings").select("vat_rate,number_format,next_number,number_year").eq("organization_id", org).maybeSingle() : { data: null };
    const settings = s ?? { vat_rate: 7, number_format: "{YYYY}-{NNNN}", next_number: 1, number_year: null };
    setNumber(nextInvoiceNumber(settings, Number(businessDate().slice(0, 4))));
    const n = nightsOf(reservation.check_in, reservation.check_out);
    setItems([{ description: `Übernachtung Zimmer ${reservation.room} (${stay})`, quantity: n, unit_price: Math.round((Number(reservation.revenue) / n) * 100) / 100, vat_rate: Number(settings.vat_rate) }]);
  };
  useEffect(() => {
    if (!open) return;
    setName(reservation.company_name || reservation.guest_name); setEmail(reservation.guest_email ?? ""); setAddress(""); setNote(""); setDate(businessDate());
    void load();
  }, [open, reservation.id]);

  const totals = invoiceTotals(items);
  const setItem = (i: number, patch: Partial<InvoiceItem>) => setItems((x) => x.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const docOf = (s: Saved): InvoiceDoc => ({ ...s, items: s.items, stay });

  const create = async () => {
    if (!name.trim()) return toast.error(t("invoice.errRecipient"));
    if (!items.length || items.some((x) => !x.description.trim() || x.quantity <= 0)) return toast.error(t("invoice.errItems"));
    setBusy(true);
    const { data: id, error } = await supabase.rpc("create_invoice", { _reservation: reservation.id, _number: number, _issue_date: date, _recipient_name: name, _recipient_address: address, _recipient_email: email, _items: items as never, _note: note || undefined });
    setBusy(false);
    if (error) return toast.error(error.message.includes("exists") ? t("invoice.errNumber") : t("invoice.failed"));
    toast.success(t("invoice.created"));
    await load();
    const { data } = await supabase.from("invoices").select("*").eq("id", id as string).maybeSingle();
    if (data) printInvoice(docOf(data as unknown as Saved));
  };

  const send = async (s: Saved) => {
    const to = s.recipient_email || email;
    if (!to) return toast.error(t("invoice.errEmail"));
    printInvoice(docOf(s));
    window.location.href = invoiceMailto(docOf(s), to);
    await supabase.rpc("mark_invoice_sent", { _invoice: s.id }); void load();
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>{t("invoice.title")}</DialogTitle><DialogDescription>{reservation.guest_name} · {stay}</DialogDescription></DialogHeader>
      {list.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("invoice.existing")}</h3>
        {list.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <span className="font-medium">{s.invoice_number}</span><span className="text-muted-foreground">{formatDateDE(s.issue_date)} · {eur(Number(s.gross_total))}</span>
          {s.sent_at && <span className="text-xs text-muted-foreground">{t("invoice.sent")}</span>}
          <span className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => printInvoice(docOf(s))}><Printer className="mr-1 h-4 w-4" />PDF</Button>
          <Button size="sm" variant="outline" onClick={() => send(s)}><Mail className="mr-1 h-4 w-4" />{t("invoice.email")}</Button>
        </div>)}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.number")}</span><Input value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.date")}</span><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.recipient")}</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("common.email")}</span><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2"><span className="text-xs text-muted-foreground">{t("invoice.address")}</span><textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className="rounded-md border border-input bg-card p-2" /></label>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_6rem_4rem_2rem] gap-2 text-xs text-muted-foreground"><span>{t("invoice.description")}</span><span>{t("invoice.qty")}</span><span>{t("invoice.price")}</span><span>{t("invoice.vat")}</span><span /></div>
        {items.map((it, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_4rem_6rem_4rem_2rem] gap-2">
          <Input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
          <Input type="number" min={0} step="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: +e.target.value || 0 })} />
          <Input type="number" min={0} step="0.01" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: +e.target.value || 0 })} />
          <Input type="number" min={0} max={100} step="1" value={it.vat_rate} onChange={(e) => setItem(i, { vat_rate: +e.target.value || 0 })} />
          <Button type="button" variant="ghost" size="icon" aria-label={t("invoice.removeLine")} onClick={() => setItems((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
        <Button type="button" variant="ghost" size="sm" onClick={() => setItems((x) => [...x, { description: "", quantity: 1, unit_price: 0, vat_rate: x[0]?.vat_rate ?? 7 }])}><Plus className="mr-1 h-4 w-4" />{t("invoice.addLine")}</Button>
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
