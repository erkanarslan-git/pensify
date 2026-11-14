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
type Form = Record<(typeof TEXT)[number] | "address" | "footer_note" | "number_format", string> & { vat_rate: number; next_number: number; number_year: number | null };
const EMPTY: Form = { company_name: "", tax_number: "", vat_id: "", email: "", phone: "", bank_name: "", iban: "", bic: "", address: "", footer_note: "", number_format: "{YYYY}-{NNNN}", vat_rate: 7, next_number: 1, number_year: null };

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
      number_format: f.number_format.trim(), vat_rate: Math.min(100, Math.max(0, Number(f.vat_rate) || 0)), next_number: Math.max(1, Math.floor(Number(f.next_number) || 1)),
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
      <label className="grid gap-1 text-sm sm:col-span-2"><span className="text-xs text-muted-foreground">{t("invoice.f.footer_note")}</span><textarea rows={2} value={f.footer_note} onChange={(e) => setF({ ...f, footer_note: e.target.value })} className="rounded-md border border-input bg-card p-2" /></label>
    </div>
    <Button className="mt-4" disabled={busy || !org} onClick={save}>{t("common.save")}</Button>
  </Section>;
}
