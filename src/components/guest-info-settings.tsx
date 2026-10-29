import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FIELDS = ["check_in_time", "check_out_time", "account_holder", "iban", "bic", "bank_name", "contact_phone"] as const;
type Form = Record<(typeof FIELDS)[number] | "extra_note", string>;
const EMPTY: Form = { check_in_time: "15:00", check_out_time: "11:00", account_holder: "", iban: "", bic: "", bank_name: "", contact_phone: "", extra_note: "" };

export function GuestInfoSettingsTab() {
  const { t } = useTranslation();
  const [org, setOrg] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => {
    const { data: o } = await supabase.rpc("active_organization_id"); if (!o) return; setOrg(o);
    const { data } = await supabase.from("guest_message_settings").select("*").eq("organization_id", o).maybeSingle();
    if (data) setF({ ...EMPTY, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? ""])) } as Form);
  })(); }, []);
  const save = async () => {
    if (!org) return; setBusy(true);
    const clean = (v: string) => v.trim() || null;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("guest_message_settings").upsert({
      organization_id: org, check_in_time: f.check_in_time || "15:00", check_out_time: f.check_out_time || "11:00",
      account_holder: clean(f.account_holder), iban: clean(f.iban.replace(/\s+/g, " ").toUpperCase()), bic: clean(f.bic.toUpperCase()),
      bank_name: clean(f.bank_name), contact_phone: clean(f.contact_phone), extra_note: clean(f.extra_note),
      updated_by: u.user?.id ?? null, updated_at: new Date().toISOString(),
    });
    setBusy(false); if (error) toast.error(t("guestMsg.saveFailed")); else toast.success(t("guestMsg.saved"));
  };
  return <Section title={t("guestMsg.settingsTitle")}>
    <p className="mb-4 text-sm text-muted-foreground">{t("guestMsg.settingsText")}</p>
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {FIELDS.map((k) => <label key={k} className="grid gap-1 text-sm"><span className="text-xs text-muted-foreground">{t(`guestMsg.f.${k}`)}</span>
        <Input type={k.endsWith("_time") ? "time" : "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
      <label className="grid gap-1 text-sm sm:col-span-2"><span className="text-xs text-muted-foreground">{t("guestMsg.f.extra_note")}</span>
        <textarea rows={3} value={f.extra_note} onChange={(e) => setF({ ...f, extra_note: e.target.value })} className="rounded-md border border-input bg-card p-2" /></label>
    </div>
    <Button className="mt-4" disabled={busy || !org} onClick={save}>{t("common.save")}</Button>
  </Section>;
}
