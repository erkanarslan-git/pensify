import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nextInvoiceNumber } from "@/lib/invoice";
import { businessDate } from "@/lib/business-time";

const TEXT = ["company_name", "tax_number", "vat_id", "email", "phone", "bank_name", "iban", "bic"] as const;
type Form = Record<(typeof TEXT)[number] | "address" | "footer_note" | "number_format" | "payment_terms", string> & { payment_due_days: number; next_customer_number: number; vat_rate: number; next_number: number; number_year: number | null };
const EMPTY: Form = { company_name: "", tax_number: "", vat_id: "", email: "", phone: "", bank_name: "", iban: "", bic: "", address: "", footer_note: "", number_format: "{YYYY}-{NNNN}", payment_terms: "Zahlbar sofort nach Erhalt der Rechnung ohne Abzug.", payment_due_days: 0, next_customer_number: 10001, vat_rate: 7, next_number: 1, number_year: null };

export function InvoiceSettingsTab() {
  const { t } = useTranslation();
  const [org, setOrg] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => {
    const { data: o } = await supabase.rpc("active_organization_id"); if (!o) return; setOrg(o);
    const { data } = await supabase.from("invoice_settings").select("*").eq("organization_id", o).maybeSingle();
    if (data) setF({ ...EMPTY, ...Object.fromEntries(Object.entries(data).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? (k === "number_year" ? null : "")])) } as Form);
  })(); }, []);
  const save = async () => {
    if (!org) return;
    if (!/\{N{3,5}\}/.test(f.number_format)) return toast.error(t("invoice.errFormat"));
    setBusy(true);
    const clean = (v: string) => v.trim() || null;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("invoice_settings").upsert({
      organization_id: org, ...Object.fromEntries(TEXT.map((k) => [k, clean(f[k])])), address: clean(f.address), footer_note: clean(f.footer_note),
      number_format: f.number_format.trim(), payment_terms: f.payment_terms.trim() || "Zahlbar sofort nach Erhalt der Rechnung ohne Abzug.", payment_due_days: Math.min(365, Math.max(0, Math.floor(Number(f.payment_due_days) || 0))), next_customer_number: Math.max(1, Math.floor(Number(f.next_customer_number) || 1)), vat_rate: Math.min(100, Math.max(0, Number(f.vat_rate) || 0)), next_number: Math.max(1, Math.floor(Number(f.next_number) || 1)),
      number_year: f.number_year ?? Number(businessDate().slice(0, 4)), updated_by: u.user?.id ?? null, updated_at: new Date().toISOString(),
    });
    setBusy(false); if (error) toast.error(t("invoice.saveFailed")); else toast.success(t("invoice.saved"));
  };
  const year = Number(businessDate().slice(0, 4));
  return <Section title={t("invoice.settingsTitle")}>
    <p className="mb-4 text-sm text-muted-foreground">{t("invoice.settingsText")}</p>
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {TEXT.map((k) => <label key={k} className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t(`invoice.f.${k}`)}</span><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
      <label className="grid gap-1 text-sm sm:col-span-2"><span className="text-xs text-muted-foreground">{t("invoice.address")}</span><textarea rows={3} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className="rounded-md border border-input bg-card p-2" /></label>
      <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.f.vat_rate")}</span><Input type="number" min={0} max={100} step="0.5" value={f.vat_rate} onChange={(e) => setF({ ...f, vat_rate: +e.target.value })} /></label>
      <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.f.number_format")}</span><Input value={f.number_format} onChange={(e) => setF({ ...f, number_format: e.target.value })} /></label>
      <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.f.next_number")}</span><Input type="number" min={1} step="1" value={f.next_number} onChange={(e) => setF({ ...f, next_number: +e.target.value, number_year: year })} /></label>
      <div className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.preview")}</span><span className="py-2 font-medium">{nextInvoiceNumber(f, year)}</span></div>
      <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.f.payment_due_days")}</span><Input type="number" min={0} max={365} step="1" value={f.payment_due_days} onChange={(e) => setF({ ...f, payment_due_days: +e.target.value })} /></label>
      <label className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t("invoice.f.next_customer_number")}</span><Input type="number" min={1} step="1" value={f.next_customer_number} onChange={(e) => setF({ ...f, next_customer_number: +e.target.value })} /></label>
      <label className="grid gap-1 text-sm sm:col-span-2"><span className="text-xs text-muted-foreground">{t("invoice.paymentTerms")}</span><Input value={f.payment_terms} maxLength={500} onChange={(e) => setF({ ...f, payment_terms: e.target.value })} /></label>
      <label className="grid gap-1 text-sm sm:col-span-2"><span className="text-xs text-muted-foreground">{t("invoice.f.footer_note")}</span><textarea rows={2} value={f.footer_note} onChange={(e) => setF({ ...f, footer_note: e.target.value })} className="rounded-md border border-input bg-card p-2" /></label>
    </div>
    <Button className="mt-4" disabled={busy || !org} onClick={save}>{t("common.save")}</Button>
    {org && <InvoiceArticles org={org} />}
  </Section>;
}

interface Art { id?: string; article_no: string; description: string; unit: string; unit_price: number; vat_rate: number }
function InvoiceArticles({ org }: { org: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Art[]>([]);
  const [draft, setDraft] = useState<Art>({ article_no: "", description: "", unit: "Stk.", unit_price: 0, vat_rate: 19 });
  const load = async () => { const { data } = await supabase.from("invoice_articles").select("id,article_no,description,unit,unit_price,vat_rate").eq("organization_id", org).order("article_no"); setRows((data ?? []) as Art[]); };
  useEffect(() => { void load(); }, [org]);
  const add = async () => {
    if (!draft.article_no.trim() || !draft.description.trim()) return toast.error(t("invoice.errArticle"));
    const { error } = await supabase.from("invoice_articles").insert({ organization_id: org, ...draft, article_no: draft.article_no.trim(), description: draft.description.trim() });
    if (error) return toast.error(error.code === "23505" ? t("invoice.errArticleDup") : t("invoice.saveFailed"));
    setDraft({ article_no: "", description: "", unit: "Stk.", unit_price: 0, vat_rate: 19 }); void load();
  };
  const remove = async (id: string) => { const { error } = await supabase.from("invoice_articles").delete().eq("id", id); if (error) toast.error(t("invoice.saveFailed")); else void load(); };
  const cols = "grid grid-cols-[5rem_minmax(0,1fr)_4rem_5.5rem_4rem_auto] gap-2 items-center";
  return <div className="mt-8 max-w-3xl space-y-2">
    <h3 className="text-sm font-semibold">{t("invoice.articles")}</h3>
    <p className="text-xs text-muted-foreground">{t("invoice.articlesText")}</p>
    <div className={`${cols} text-xs text-muted-foreground`}><span>{t("invoice.articleNo")}</span><span>{t("invoice.description")}</span><span>{t("invoice.unit")}</span><span>{t("invoice.price")}</span><span>{t("invoice.vat")}</span><span /></div>
    {rows.map((a) => <div key={a.id} className={`${cols} text-sm`}><span className="font-mono">{a.article_no}</span><span className="truncate">{a.description}</span><span>{a.unit}</span><span className="tabular-nums">{Number(a.unit_price).toFixed(2)} €</span><span>{Number(a.vat_rate)} %</span>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => a.id && remove(a.id)}>{t("common.delete")}</Button></div>)}
    <div className={cols}>
      <Input value={draft.article_no} maxLength={30} onChange={(e) => setDraft({ ...draft, article_no: e.target.value })} />
      <Input value={draft.description} maxLength={500} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      <Input value={draft.unit} maxLength={20} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
      <Input type="number" min={0} step="0.01" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: +e.target.value || 0 })} />
      <Input type="number" min={0} max={100} step="1" value={draft.vat_rate} onChange={(e) => setDraft({ ...draft, vat_rate: +e.target.value || 0 })} />
      <Button size="sm" variant="outline" onClick={add}>{t("invoice.addArticle")}</Button>
    </div>
  </div>;
}
