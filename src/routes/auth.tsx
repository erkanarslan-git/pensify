import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import logo from "@/assets/pension-highway-logo.png.asset.json";

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
  de: { title: "Willkommen zurück", sub: "Interner Zugang für das Team", email: "E-Mail", pw: "Passwort", btn: "Anmelden", forgot: "Passwort vergessen oder kein Zugang? Bitte wende dich an deinen Administrator.", secure: "Geschützter Bereich · nur für Mitarbeitende", err: "E-Mail oder Passwort ist falsch." },
  en: { title: "Welcome back", sub: "Internal access for staff", email: "Email", pw: "Password", btn: "Sign in", forgot: "Forgot your password or no access? Please contact your administrator.", secure: "Protected area · staff only", err: "Email or password is incorrect." },
  tr: { title: "Tekrar hoş geldin", sub: "Ekip için iç erişim", email: "E-posta", pw: "Şifre", btn: "Giriş yap", forgot: "Şifreni mi unuttun veya erişimin yok mu? Lütfen yöneticine başvur.", secure: "Korumalı alan · sadece çalışanlar", err: "E-posta veya şifre hatalı." },
} as const;

function AuthPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const lang = (["de", "en", "tr"].includes(i18n.resolvedLanguage ?? "") ? i18n.resolvedLanguage : "de") as keyof typeof COPY;
  const c = COPY[lang];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return toast.error(c.err);
    navigate({ to: "/" });
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-[color:var(--brand-cream)]" style={{ background: "var(--gradient-brand-night)" }}>
      {/* Road pattern */}
      <svg className="highway-drift pointer-events-none absolute inset-0 h-full w-full opacity-40" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="currentColor" opacity="0.18" />
          </pattern>
        </defs>
        <rect width="1200" height="800" fill="url(#dots)" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M-100 ${620 - i * 140} C 300 ${520 - i * 140}, 700 ${760 - i * 140}, 1300 ${560 - i * 140}`} fill="none" stroke="currentColor" strokeOpacity={0.12 + i * 0.05} strokeWidth="2" />
        ))}
        <path className="highway-dash" d="M-100 480 C 300 380, 700 620, 1300 420" fill="none" stroke="var(--brand-orange)" strokeWidth="3" strokeDasharray="40 30" strokeLinecap="round" opacity="0.7" />
      </svg>

      <div className="absolute right-4 top-4 z-10 flex gap-1">
        {(["de", "en", "tr"] as const).map((l) => (
          <button key={l} onClick={() => i18n.changeLanguage(l)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${lang === l ? "bg-[color:var(--brand-cream)] text-[color:var(--brand-navy-deep)]" : "text-[color:var(--brand-cream)]/70 hover:bg-[color:var(--brand-cream)]/10"}`}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <main className="relative z-10 grid min-h-screen place-items-center px-5 py-16">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-[color:var(--brand-cream)]/15 bg-[color:var(--brand-cream)] p-8 text-[color:var(--brand-navy-deep)] shadow-2xl">
            <img src={logo.url} alt="Pension Highway – Stay here!" className="mx-auto h-auto w-64" />
            <div className="mt-6 text-center">
              <h1 className="text-xl font-semibold">{c.title}</h1>
              <p className="mt-1 text-sm opacity-70">{c.sub}</p>
            </div>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field icon={<Mail className="h-4 w-4" />} label={c.email}>
                <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" />
              </Field>
              <Field icon={<Lock className="h-4 w-4" />} label={c.pw}>
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" />
              </Field>
              <button type="submit" disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-[color:var(--brand-cream)] shadow-lg transition hover:brightness-110 disabled:opacity-60"
                style={{ background: "linear-gradient(120deg, var(--brand-orange), color-mix(in oklab, var(--brand-orange) 70%, var(--brand-navy)))" }}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {c.btn}
              </button>
            </form>
            <p className="mt-5 text-center text-xs leading-relaxed opacity-70">{c.forgot}</p>
          </div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs opacity-70">
            <ShieldCheck className="h-3.5 w-3.5" /> {c.secure}
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium opacity-70">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-[color:var(--brand-navy)]/20 bg-background px-3 focus-within:border-[color:var(--brand-orange)] focus-within:ring-2 focus-within:ring-[color:var(--brand-orange)]/25">
        <span className="opacity-50">{icon}</span>
        {children}
      </div>
    </label>
  );
}
