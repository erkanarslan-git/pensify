import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { LoginFlow } from "@/components/login-flow";
import { Button } from "@/components/ui/button";
import logo from "@/assets/pension-highway-logo.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Anmelden — Pension Highway" },
      { name: "description", content: "Interner Zugang für das Team von Pension Highway." },
      { property: "og:title", content: "Anmelden — Pension Highway" },
      { property: "og:description", content: "Interner Zugang für das Team von Pension Highway." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const COPY = {
  de: { flow: { eyebrow: "Pension Highway · Workspace", title: "Ein guter Tag beginnt mit Überblick.", sub: "Standorte, Buchungen und dein Team. Alles an einem Ort, damit der Alltag einfacher wird.", res: "Reservierung", room: "Zimmer", roomSub: "Vorbereitet", guests: "Zufriedene Gäste", guestsSub: "Willkommen bei uns", direct: "Direkt", web: "Webseite", caption: "So greifen die Abläufe ineinander · Illustration", team: "Der Arbeitsbereich für das Pension Highway Team" }, title: "Willkommen zurück", sub: "Interner Zugang für das Team", email: "E-Mail", pw: "Passwort", btn: "Anmelden", forgot: "Passwort vergessen oder kein Zugang? Bitte wende dich an deinen Administrator.", secure: "Geschützter Bereich · nur für Mitarbeitende", err: "E-Mail oder Passwort ist falsch." },
  en: { flow: { eyebrow: "Pension Highway · Workspace", title: "A good day starts with an overview.", sub: "Locations, bookings and your team. All in one place to make every day easier.", res: "Reservation", room: "Room", roomSub: "Prepared", guests: "Happy guests", guestsSub: "Welcome to us", direct: "Direct", web: "Website", caption: "How the workflows connect · Illustration", team: "The workspace for the Pension Highway team" }, title: "Welcome back", sub: "Internal access for staff", email: "Email", pw: "Password", btn: "Sign in", forgot: "Forgot your password or no access? Please contact your administrator.", secure: "Protected area · staff only", err: "Email or password is incorrect." },
  tr: { flow: { eyebrow: "Pension Highway · Çalışma alanı", title: "İyi bir gün genel bakışla başlar.", sub: "Tesisler, rezervasyonlar ve ekibin. Her şey tek yerde, günlük iş kolaylaşsın diye.", res: "Rezervasyon", room: "Oda", roomSub: "Hazırlandı", guests: "Mutlu misafirler", guestsSub: "Hoş geldiniz", direct: "Direkt", web: "Web sitesi", caption: "İş akışları nasıl birleşiyor · Görsel", team: "Pension Highway ekibinin çalışma alanı" }, title: "Tekrar hoş geldin", sub: "Ekip için iç erişim", email: "E-posta", pw: "Şifre", btn: "Giriş yap", forgot: "Şifreni mi unuttun veya erişimin yok mu? Lütfen yöneticine başvur.", secure: "Korumalı alan · sadece çalışanlar", err: "E-posta veya şifre hatalı." },
} as const;

const FEEDBACK = {
  de: { signing: "Anmeldung läuft…", opening: "Arbeitsbereich wird geöffnet…", show: "Passwort anzeigen", hide: "Passwort verbergen", connection: "Anmeldung nicht möglich. Bitte prüfe deine Verbindung und versuche es erneut." },
  en: { signing: "Signing in…", opening: "Opening workspace…", show: "Show password", hide: "Hide password", connection: "Unable to sign in. Please check your connection and try again." },
  tr: { signing: "Giriş yapılıyor…", opening: "Çalışma alanı açılıyor…", show: "Şifreyi göster", hide: "Şifreyi gizle", connection: "Giriş tamamlanamadı. Bağlantını kontrol edip tekrar dene." },
} as const;

function AuthPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorKind, setErrorKind] = useState<"credentials" | "connection" | null>(null);
  const submitting = useRef(false);
  const lang = (["de", "en", "tr"].includes(i18n.resolvedLanguage ?? "") ? i18n.resolvedLanguage : "de") as keyof typeof COPY;
  const c = COPY[lang];
  const feedback = FEEDBACK[lang];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setErrorKind(null);
    setOpening(false);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setErrorKind(error.code === "invalid_credentials" ? "credentials" : "connection");
        return;
      }
      if (!data.session) {
        setErrorKind("connection");
        return;
      }
      setOpening(true);
      const token = sessionStorage.getItem("pensify.clockToken");
      sessionStorage.removeItem("pensify.clockToken");
      const back = sessionStorage.getItem("pensify.returnTo");
      sessionStorage.removeItem("pensify.returnTo");
      if (token && /^[A-Za-z0-9_-]{1,128}$/.test(token)) await navigate({ to: "/clock/$token", params: { token } });
      // Only same-app paths (no "//" or scheme) to avoid external redirects.
      else if (back && /^\/(?!\/)[A-Za-z0-9/_\-.?=&%]*$/.test(back) && back !== "/auth") await navigate({ href: back });
      else await navigate({ to: "/" });
    } catch {
      setErrorKind("connection");
    } finally {
      submitting.current = false;
      setBusy(false);
      setOpening(false);
    }
  }

  return (
    <div className="brand-hero relative min-h-screen overflow-hidden">

      <div className="absolute right-4 top-4 z-20 flex gap-1">
        {(["de", "en", "tr"] as const).map((l) => (
          <Button key={l} type="button" variant="ghost" size="sm" aria-pressed={lang === l} onClick={() => i18n.changeLanguage(l)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${lang === l ? "bg-[color:var(--brand-cream)] text-[color:var(--brand-navy-deep)]" : "text-[color:var(--brand-cream)]/70 hover:bg-[color:var(--brand-cream)]/10"}`}>
            {l.toUpperCase()}
          </Button>
        ))}
      </div>

      <main className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:px-8 xl:gap-20">
        <section className="hidden min-w-0 lg:block">
          <LoginFlow c={c.flow} />
        </section>
        <div className="grid min-w-0 place-items-center">
        <div className="w-full max-w-md">
          <div className="login-surface rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-8">
            <img src={logo} alt="Pension Highway – Stay here!" className="mx-auto h-auto w-64 max-w-full" />
            <div className="mt-6 text-center">
              <h1 className="text-xl font-semibold">{c.title}</h1>
              <p className="mt-1 text-sm opacity-70">{c.sub}</p>
            </div>
            <form onSubmit={handleSubmit} aria-busy={busy} className="mt-6 space-y-4">
              <Field icon={<Mail className="h-4 w-4" />} label={c.email}>
                <input type="email" required disabled={busy} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0 w-full bg-transparent py-2.5 text-sm outline-none" />
              </Field>
              <Field icon={<Lock className="h-4 w-4" />} label={c.pw}>
                <input type={showPassword ? "text" : "password"} required disabled={busy} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="min-w-0 w-full bg-transparent py-2.5 text-sm outline-none" />
                <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? feedback.hide : feedback.show} title={showPassword ? feedback.hide : feedback.show} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} className="shrink-0 text-muted-foreground">
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </Field>
              {errorKind && <p role="alert" className="text-sm text-destructive">{errorKind === "credentials" ? c.err : feedback.connection}</p>}
              <Button type="submit" disabled={busy} className="h-12 w-full rounded-lg font-semibold">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <span role="status" aria-live="polite">{busy ? (opening ? feedback.opening : feedback.signing) : c.btn}</span>
              </Button>
            </form>
            <p className="mt-5 text-center text-xs leading-relaxed opacity-70">{c.forgot}</p>
          </div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs opacity-70">
            <ShieldCheck className="h-3.5 w-3.5" /> {c.secure}
          </p>
        </div>
        </div>
      </main>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium opacity-70">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-background text-foreground px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <span className="shrink-0 opacity-50">{icon}</span>
        {children}
      </div>
    </label>
  );
}
