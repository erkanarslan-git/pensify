import { createFileRoute, useRouterState, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Globe, Bell, Mail, Building2, Shield, Palette, Languages, Paintbrush, ScrollText, User as UserIcon, FileUp, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Ayarlar — Pensify" }, { name: "description", content: "Pensify ayarlarını ve şirket bilgilerini yönetin." }, { property: "og:title", content: "Ayarlar — Pensify" }, { property: "og:description", content: "Pensify ayarlarını ve şirket bilgilerini yönetin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsLayout,
});

type TabKey = "general" | "profile" | "language" | "notifications" | "email" | "company" | "appearance" | "channels" | "security" | "logs" | "import" | "integrations" | "trash";

const tabs: { key: TabKey; icon: typeof Globe }[] = [
  { key: "general", icon: Globe },
  { key: "profile", icon: UserIcon },
  { key: "language", icon: Languages },
  { key: "notifications", icon: Bell },
  { key: "email", icon: Mail },
  { key: "company", icon: Building2 },
  { key: "appearance", icon: Palette },
  { key: "channels", icon: Paintbrush },
  { key: "integrations", icon: Globe },
  { key: "security", icon: Shield },
  { key: "logs", icon: ScrollText },
  { key: "import", icon: FileUp },
  { key: "trash", icon: Trash2 },
];

function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  useEffect(() => {
    if (pathname === "/settings/logs") setActiveTab("logs");
    else if (pathname === "/settings/import") setActiveTab("import");
    else if (pathname === "/settings/integrations") setActiveTab("integrations");
    else if (pathname === "/settings/trash") setActiveTab("trash");
    else setActiveTab("general");
  }, [pathname]);

  const isChildRoute = pathname !== "/settings";

  return (
    <AppShell title={t("pages.settings.title")} subtitle={t("pages.settings.subtitle")}>
      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
        <aside className="rounded-xl border border-border bg-card p-2 h-fit">
          {tabs.map((x) => {
            const Icon = x.icon;
            const active = activeTab === x.key;
            return (
              <button
                key={x.key}
                onClick={() => {
                  if (x.key === "integrations") {
                    navigate({ to: "/settings/integrations" });
                  } else if (x.key === "logs") {
                    navigate({ to: "/settings/logs" });
                  } else if (x.key === "import") {
                    navigate({ to: "/settings/import" });
                  } else if (x.key === "trash") {
                    navigate({ to: "/settings/trash" });
                  } else {
                    setActiveTab(x.key);
                    if (isChildRoute) navigate({ to: "/settings" });
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "brand-tile font-medium shadow-sm" : "hover:bg-accent/50 text-muted-foreground"}`}
              >
                <Icon className="w-4 h-4" /> {t(x.key === "integrations" ? "integrations.title" : `pages.settings.tabs.${x.key}`)}
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
    void supabase.rpc("save_tv_source_colors", { _colors: next }).then(({ error }) => { if (error) toast.error(t("tv.failed")); });
  }
  function resetColors() {
    setChannelColors(DEFAULT_CHANNEL_COLORS);
    saveChannelColors(DEFAULT_CHANNEL_COLORS);
    void supabase.rpc("save_tv_source_colors", { _colors: DEFAULT_CHANNEL_COLORS }).then(({ error }) => { if (error) toast.error(t("tv.failed")); });
  }

  return (
    <>
      {activeTab === "general" && (
        <Section title={t("pages.settings.generalTitle")}>
          <p className="text-sm text-muted-foreground">
            {t("pages.settings.generalText")}
          </p>
        </Section>
      )}

      {activeTab === "language" && (
        <Section title={t("pages.settings.languageTitle")}>
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
          <p className="text-xs text-muted-foreground mt-3">{t("pages.settings.currentLanguage")}: <strong>{i18n.resolvedLanguage}</strong></p>
        </Section>
      )}

      {activeTab === "notifications" && (
        <Section title={t("pages.settings.notificationsTitle")}>
          <div className="space-y-3 max-w-md">
            <Toggle label={t("pages.settings.emailNotif")} value={emailNotif} onChange={(v) => { setEmailNotif(v); save("emailNotif", v ? "1" : "0"); }} />
            <Toggle label={t("pages.settings.browserNotif")} value={browserNotif} onChange={(v) => { setBrowserNotif(v); save("browserNotif", v ? "1" : "0"); }} />
            <Toggle label={t("pages.settings.whatsappNotif")} value={whatsappNotif} onChange={(v) => { setWhatsappNotif(v); save("whatsappNotif", v ? "1" : "0"); }} />
          </div>
        </Section>
      )}

      {activeTab === "email" && (
        <Section title={t("pages.settings.emailTitle")}>
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
            <Field label={t("pages.settings.emailFrom")} value={emailFrom} onChange={(v) => { setEmailFrom(v); save("emailFrom", v); }} placeholder="buchung@meinepension.de" />
            <Field label={t("pages.settings.emailReply")} value={emailReply} onChange={(v) => { setEmailReply(v); save("emailReply", v); }} placeholder="kontakt@meinepension.de" />
          </div>
          <p className="text-xs text-muted-foreground mt-3">{t("pages.settings.emailHint")}</p>
        </Section>
      )}

      {activeTab === "company" && (
        <Section title={t("pages.settings.companyTitle")}>
          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
            <Field label={t("pages.settings.companyName")} value={companyName} onChange={(v) => { setCompanyName(v); save("companyName", v); }} />
            <Field label={t("pages.settings.companyTax")} value={companyTax} onChange={(v) => { setCompanyTax(v); save("companyTax", v); }} />
            <Field label={t("pages.settings.companyAddress")} value={companyAddress} onChange={(v) => { setCompanyAddress(v); save("companyAddress", v); }} className="sm:col-span-2" />
          </div>
        </Section>
      )}

      {activeTab === "appearance" && (
        <Section title={t("pages.settings.appearanceTitle")}>
          <p className="text-sm text-muted-foreground">{t("pages.settings.appearanceText")}</p>
        </Section>
      )}

      {activeTab === "channels" && (
        <Section title={t("pages.settings.channelsTitle")}>
          <p className="text-sm text-muted-foreground mb-4">{t("pages.settings.channelsText")}</p>
          <div className="space-y-2 max-w-md">
            {ACTIVE_CHANNELS.map((ch) => (
              <div key={ch} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
                <span className="inline-block w-4 h-4 rounded" style={{ background: channelColors[ch] }} />
                <span className="text-sm flex-1">{sourceLabel(ch, key => t(key))}</span>
                <input
                  type="color"
                  value={channelColors[ch]}
                  onChange={(e) => updateColor(ch, e.target.value)}
                  className="w-10 h-8 rounded border border-border bg-transparent cursor-pointer"
                />
                <code className="text-xs text-muted-foreground w-20">{channelColors[ch]}</code>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={resetColors}>{t("pages.settings.resetColors")}</Button>
          </div>
        </Section>
      )}

      {activeTab === "profile" && <ProfileTab />}

      {activeTab === "security" && <SecurityTab />}
    </>
  );
}

function ProfileTab() {
  const { t } = useTranslation();
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
      toast.success(t("pages.settings.profileSaved"));
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  }

  if (loading) return <Section title={t("pages.settings.tabs.profile")}><p className="text-sm text-muted-foreground">{t("pages.settings.profileLoading")}</p></Section>;

  return (
    <Section title={t("pages.settings.profileTitle")}>
      <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("pages.settings.profileEmail")}</span>
          <input value={email} disabled className="px-3 py-2 rounded-md border border-input bg-muted text-sm text-muted-foreground" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("pages.settings.profileName")}</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-xs text-muted-foreground">{t("pages.settings.profileAvatar")}</span>
          <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("pages.settings.profileLanguage")}</span>
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm">
            <option value="de">Deutsch</option>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </label>
      </div>
      <div className="mt-4">
        <Button onClick={save} disabled={saving}>{t("pages.settings.save")}</Button>
      </div>
    </Section>
  );
}

function SecurityTab() {
  const { t } = useTranslation();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    if (pw.length < 8) return toast.error(t("pages.settings.passwordTooShort"));
    if (pw !== pw2) return toast.error(t("pages.settings.passwordMismatch"));
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success(t("pages.settings.passwordChanged"));
      setPw(""); setPw2("");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Section title={t("pages.settings.securityTitle")}>
      <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("pages.settings.newPassword")}</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("pages.settings.newPasswordRepeat")}</span>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </label>
      </div>
      <div className="mt-4">
        <Button onClick={change} disabled={busy}>{t("pages.settings.changePassword")}</Button>
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
