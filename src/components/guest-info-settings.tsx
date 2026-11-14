import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotateCcw } from "lucide-react";
import { MESSAGE_LANGUAGES, MESSAGE_FIELDS, isMessageLang, readMessageTemplates, defaultMessageTemplate, type MessageLang, type MessageMode, type MessageTemplates } from "@/lib/guest-messages";

const FIELDS = ["check_in_time", "check_out_time", "account_holder", "iban", "bic", "bank_name", "contact_phone"] as const;
type Form = Record<(typeof FIELDS)[number] | "extra_note", string>;
const EMPTY: Form = { check_in_time: "15:00", check_out_time: "11:00", account_holder: "", iban: "", bic: "", bank_name: "", contact_phone: "", extra_note: "" };

export function GuestInfoSettingsTab() {
  const { t } = useTranslation();
  const [org, setOrg] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplates>({});
  const [lang, setLang] = useState<MessageLang>("de");
  const [mode, setMode] = useState<MessageMode>("booking");
  const updateTemplate = (text: string) => setTemplates((current) => ({ ...current, [lang]: { ...current[lang], [mode]: text } }));
  useEffect(() => { (async () => {
    const { data: o } = await supabase.rpc("active_organization_id"); if (!o) return; setOrg(o);
    const { data, error } = await supabase.from("guest_message_settings").select("*").eq("organization_id", o).maybeSingle();
    if (error) { toast.error(t("guestMsg.loadFailed")); return; }
    if (data) {
      setF({ ...EMPTY, ...Object.fromEntries(Object.entries(data).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ""])) } as Form);
      setTemplates(readMessageTemplates(data.message_templates));
    }
    setLoaded(true);
  })(); }, []);
  const save = async () => {
    if (!org) return; setBusy(true);
    const clean = (v: string) => v.trim() || null;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("guest_message_settings").upsert({
      organization_id: org, check_in_time: f.check_in_time || "15:00", check_out_time: f.check_out_time || "11:00",
      account_holder: clean(f.account_holder), iban: clean(f.iban.replace(/\s+/g, " ").toUpperCase()), bic: clean(f.bic.toUpperCase()),
      bank_name: clean(f.bank_name), contact_phone: clean(f.contact_phone), extra_note: clean(f.extra_note),
      message_templates: readMessageTemplates(templates),
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
    <div className="mt-6 max-w-2xl border-t border-border pt-5">
      <h3 className="mb-3 text-sm font-semibold">{t("guestMsg.templatesTitle")}</h3>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select value={lang} onValueChange={(value) => { if (isMessageLang(value)) setLang(value); }}>
          <SelectTrigger className="w-40" aria-label={t("guestMsg.language")}><SelectValue /></SelectTrigger>
          <SelectContent>{MESSAGE_LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
        </Select>
        <Tabs value={mode} onValueChange={(value) => { if (value === "booking" || value === "access") setMode(value); }}>
          <TabsList><TabsTrigger value="booking">{t("guestMsg.confirmationText")}</TabsTrigger><TabsTrigger value="access">{t("guestMsg.accessText")}</TabsTrigger></TabsList>
        </Tabs>
        <Button type="button" variant="ghost" size="icon" title={t("guestMsg.restoreDefault")} aria-label={t("guestMsg.restoreDefault")} onClick={() => updateTemplate("")}><RotateCcw className="h-4 w-4" /></Button>
      </div>
      <textarea aria-label={t(mode === "booking" ? "guestMsg.confirmationText" : "guestMsg.accessText")} disabled={!loaded || busy} rows={12} value={templates[lang]?.[mode] || defaultMessageTemplate(mode, lang)} onChange={(e) => updateTemplate(e.target.value)} className="w-full rounded-md border border-input bg-card p-3 text-sm" />
      <div className="mt-2 flex flex-wrap gap-1">
        {[...MESSAGE_FIELDS, ...(mode === "access" ? ["access_codes", "building_code", "door_code", "keybox_code"] : [])].map((field) => <Button key={field} type="button" variant="ghost" size="sm" disabled={!loaded || busy} onClick={() => updateTemplate((templates[lang]?.[mode] || defaultMessageTemplate(mode, lang)) + ` {{${field}}}`)}>{t(`guestMsg.variables.${field}`)}</Button>)}
      </div>
    </div>
    <Button className="mt-4" disabled={busy || !org || !loaded} onClick={save}>{t("common.save")}</Button>
  </Section>;
}
