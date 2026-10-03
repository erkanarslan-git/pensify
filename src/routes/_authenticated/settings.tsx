import { createFileRoute, useRouterState, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Globe, Bell, Mail, Building2, Shield, Palette, Languages, Paintbrush, ScrollText, User as UserIcon, FileUp } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Einstellungen — Pensify" }] }),
  component: SettingsLayout,
});

type TabKey = "general" | "profile" | "language" | "notifications" | "email" | "company" | "appearance" | "channels" | "security" | "logs" | "import";

const tabs: { key: TabKey; label: string; icon: typeof Globe }[] = [
  { key: "general", label: "Allgemein", icon: Globe },
  { key: "profile", label: "Profil", icon: UserIcon },
  { key: "language", label: "Sprache", icon: Languages },
  { key: "notifications", label: "Benachrichtigungen", icon: Bell },
  { key: "email", label: "E-Mail", icon: Mail },
  { key: "company", label: "Unternehmen", icon: Building2 },
  { key: "appearance", label: "Darstellung", icon: Palette },
  { key: "channels", label: "Kanal-Farben", icon: Paintbrush },
  { key: "security", label: "Sicherheit", icon: Shield },
  { key: "logs", label: "Audit Logs", icon: ScrollText },
  { key: "import", label: "Datenimport", icon: FileUp },
];

function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  useEffect(() => {
    if (pathname === "/settings/logs") setActiveTab("logs");
    else if (pathname === "/settings/import") setActiveTab("import");
    else setActiveTab("general");
  }, [pathname]);

  const isChildRoute = pathname !== "/settings";

  return (
    <AppShell title="Einstellungen" subtitle="Sprache, Benachrichtigungen, E-Mail und mehr">
      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
        <aside className="rounded-xl border border-border bg-card p-2 h-fit">
          {tabs.map((x) => {
            const Icon = x.icon;
            const active = activeTab === x.key;
            return (
              <button
                key={x.key}
                onClick={() => {
                  if (x.key === "logs") {
                    navigate({ to: "/settings/logs" });
                  } else if (x.key === "import") {
                    navigate({ to: "/settings/import" });
                  } else {
                    setActiveTab(x.key);
                    if (isChildRoute) navigate({ to: "/settings" });
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground"}`}
              >
                <Icon className="w-4 h-4" /> {x.label}
              </button>
            );
          })}
        </aside>

        <div className="space-y-4">
          {isChildRoute ? <Outlet /> : <SettingsIndexContent activeTab={activeTab} setActiveTab={setActiveTab} />}
        </div>
      </div>
    </AppShell>
  );
}

import { Section } from "@/components/app-shell";
import { ACTIVE_CHANNELS, type ActiveChannel, sourceLabel } from "@/lib/guest-color";
import { DEFAULT_CHANNEL_COLORS, loadChannelColors, saveChannelColors } from "@/lib/channel-colors";
import { Button } from "@/components/ui/button";

const LANGS = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
];

function SettingsIndexContent({ activeTab, setActiveTab }: { activeTab: TabKey; setActiveTab: (t: TabKey) => void }) {
  const { t, i18n } = useTranslation();
  const [channelColors, setChannelColors] = useState<Record<ActiveChannel, string>>(DEFAULT_CHANNEL_COLORS);

  const [emailNotif, setEmailNotif] = useState(true);
  const [browserNotif, setBrowserNotif] = useState(true);
  const [whatsappNotif, setWhatsappNotif] = useState(false);
  const [emailFrom, setEmailFrom] = useState("");
  const [emailReply, setEmailReply] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyTax, setCompanyTax] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  useEffect(() => {
    const load = (k: string) => localStorage.getItem(`pensify.settings.${k}`);
    setEmailNotif(load("emailNotif") !== "0");
    setBrowserNotif(load("browserNotif") !== "0");
    setWhatsappNotif(load("whatsappNotif") === "1");
    setEmailFrom(load("emailFrom") ?? "");
    setEmailReply(load("emailReply") ?? "");
    setCompanyName(load("companyName") ?? "");
    setCompanyTax(load("companyTax") ?? "");
    setCompanyAddress(load("companyAddress") ?? "");
    setChannelColors(loadChannelColors());
  }, []);

  const save = (k: string, v: string) => localStorage.setItem(`pensify.settings.${k}`, v);

  function updateColor(ch: ActiveChannel, color: string) {
    const next = { ...channelColors, [ch]: color };
    setChannelColors(next);
    saveChannelColors(next);
  }
  function resetColors() {
    setChannelColors(DEFAULT_CHANNEL_COLORS);
    saveChannelColors(DEFAULT_CHANNEL_COLORS);
  }

  return (
    <>
      {activeTab === "general" && (
        <Section title="Allgemein">
          <p className="text-sm text-muted-foreground">
            Hauptsprache der Anwendung ist Deutsch. Weitere Optionen findest du in den anderen Reitern.
          </p>
        </Section>
      )}

      {activeTab === "language" && (
        <Section title="Sprache der Oberfläche">
          <div className="grid sm:grid-cols-3 gap-2 max-w-md">
            {LANGS.map((l) => {
              const active = i18n.resolvedLanguage === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => i18n.changeLanguage(l.code)}
                  className={`px-3 py-2 rounded-lg border text-sm ${active ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent"}`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">{t("common.language")}: <strong>{i18n.resolvedLanguage}</strong></p>
        </Section>
      )}

      {activeTab === "notifications" && (
        <Section title="Benachrichtigungen">
          <div className="space-y-3 max-w-md">
            <Toggle label="E-Mail Benachrichtigungen" value={emailNotif} onChange={(v) => { setEmailNotif(v); save("emailNotif", v ? "1" : "0"); }} />
            <Toggle label="Browser-Benachrichtigungen" value={browserNotif} onChange={(v) => { setBrowserNotif(v); save("browserNotif", v ? "1" : "0"); }} />
            <Toggle label="WhatsApp-Benachrichtigungen" value={whatsappNotif} onChange={(v) => { setWhatsappNotif(v); save("whatsappNotif", v ? "1" : "0"); }} />
          </div>
        </Section>
      )}

      {activeTab === "email" && (
        <Section title="E-Mail Versand">
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
            <Field label="Absender (Von)" value={emailFrom} onChange={(v) => { setEmailFrom(v); save("emailFrom", v); }} placeholder="buchung@meinepension.de" />
            <Field label="Antwort an" value={emailReply} onChange={(v) => { setEmailReply(v); save("emailReply", v); }} placeholder="kontakt@meinepension.de" />
          </div>
          <p className="text-xs text-muted-foreground mt-3">Diese Adressen werden für Buchungs-Bestätigungen und Benachrichtigungen verwendet.</p>
        </Section>
      )}

      {activeTab === "company" && (
        <Section title="Unternehmen">
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
            <Field label="Firmenname" value={companyName} onChange={(v) => { setCompanyName(v); save("companyName", v); }} />
            <Field label="USt-IdNr." value={companyTax} onChange={(v) => { setCompanyTax(v); save("companyTax", v); }} />
            <Field label="Anschrift" value={companyAddress} onChange={(v) => { setCompanyAddress(v); save("companyAddress", v); }} className="sm:col-span-2" />
          </div>
        </Section>
      )}

      {activeTab === "appearance" && (
        <Section title="Darstellung">
          <p className="text-sm text-muted-foreground">Hell/Dunkel-Modus kannst du oben rechts in der Kopfzeile umschalten.</p>
        </Section>
      )}

      {activeTab === "channels" && (
        <Section title="Kanal-Farben">
          <p className="text-sm text-muted-foreground mb-4">Diese Farben werden im Kalender als linke Randmarkierung und in der Legende verwendet.</p>
          <div className="space-y-2 max-w-md">
            {ACTIVE_CHANNELS.map((ch) => (
              <div key={ch} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
                <span className="inline-block w-4 h-4 rounded" style={{ background: channelColors[ch] }} />
                <span className="text-sm flex-1">{sourceLabel(ch)}</span>
                <input
                  type="color"
                  value={channelColors[ch]}
                  onChange={(e) => updateColor(ch, e.target.value)}
                  className="w-10 h-8 rounded border border-border bg-transparent cursor-pointer"
                />
                <code className="text-xs text-muted-foreground w-20">{channelColors[ch]}</code>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={resetColors}>Auf Standard zurücksetzen</Button>
          </div>
        </Section>
      )}

      {activeTab === "profile" && <ProfileTab />}

      {activeTab === "security" && <SecurityTab />}
    </>
  );
}

function ProfileTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [locale, setLocale] = useState("de");

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data: p } = await supabase.from("profiles").select("full_name, avatar_url, locale").eq("id", u.user.id).maybeSingle();
      setFullName(p?.full_name ?? "");
      setAvatarUrl(p?.avatar_url ?? "");
      setLocale(p?.locale ?? "de");
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("profiles").upsert({
        id: u.user.id, full_name: fullName, avatar_url: avatarUrl || null, locale, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Profil gespeichert");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  if (loading) return <Section title="Profil"><p className="text-sm text-muted-foreground">Lade…</p></Section>;

  return (
    <Section title="Mein Profil">
      <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">E-Mail</span>
          <input value={email} disabled className="px-3 py-2 rounded-md border border-input bg-muted text-sm text-muted-foreground" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Voller Name</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-xs text-muted-foreground">Avatar-URL</span>
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Sprache</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm">
            <option value="de">Deutsch</option>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </label>
      </div>
      <div className="mt-4">
        <Button onClick={save} disabled={saving}>Speichern</Button>
      </div>
    </Section>
  );
}

function SecurityTab() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    if (pw.length < 8) return toast.error("Mindestens 8 Zeichen");
    if (pw !== pw2) return toast.error("Passwörter stimmen nicht überein");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Passwort geändert");
      setPw(""); setPw2("");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Section title="Sicherheit">
      <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Neues Passwort</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Neues Passwort (wiederholen)</span>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
      </div>
      <div className="mt-4">
        <Button onClick={change} disabled={busy}>Passwort ändern</Button>
      </div>
    </Section>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full transition-colors relative ${value ? "bg-primary" : "bg-muted"}`}
        aria-pressed={value}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function Field({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`grid gap-1 ${className ?? ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-md border border-input bg-card text-sm"
      />
    </label>
  );
}
