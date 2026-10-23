import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/pension-highway-logo.png.asset.json";

const COPY = {
  de: { welcome: "Willkommen zurück", pw: "Passwort", btn: "Entsperren", err: "Passwort ist falsch.", locked: "Bildschirm gesperrt", other: "Anderes Konto" },
  en: { welcome: "Welcome back", pw: "Password", btn: "Unlock", err: "Incorrect password.", locked: "Screen locked", other: "Different account" },
  tr: { welcome: "Tekrar hoş geldin", pw: "Şifre", btn: "Kilidi aç", err: "Şifre hatalı.", locked: "Ekran kilitli", other: "Başka hesap" },
} as const;

export function LockScreen({ name, email, onUnlock, onSignOut }: {
  name: string;
  email: string;
  onUnlock: () => void;
  onSignOut: () => void;
}) {
  const { i18n } = useTranslation();
  const lang = (["de", "en", "tr"].includes(i18n.resolvedLanguage ?? "") ? i18n.resolvedLanguage : "de") as keyof typeof COPY;
  const c = COPY[lang];
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(id);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) {
      setError(c.err);
      setPw("");
      return;
    }
    onUnlock();
  }

  const time = now.toLocaleTimeString(lang === "en" ? "en-GB" : lang, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  const date = now.toLocaleDateString(lang === "en" ? "en-GB" : lang, { weekday: "long", day: "2-digit", month: "long", timeZone: "Europe/Berlin" });

  return (
    <div role="dialog" aria-modal="true" aria-label={c.locked}
      className="highway-pan fixed inset-0 z-[100] overflow-hidden text-[color:var(--brand-cream)]"
      style={{ background: "var(--gradient-brand-night)", backgroundSize: "200% 200%" }}>

      <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-5 py-12 text-center">
        <div className="text-6xl font-light tabular-nums md:text-7xl">{time}</div>
        <div className="mt-1 text-sm capitalize opacity-70">{date}</div>

        <div className="mt-10 w-full max-w-sm rounded-2xl bg-[color:var(--brand-cream)] p-7 text-[color:var(--brand-navy-deep)] shadow-2xl">
          <img src={logo.url} alt="Pension Highway" className="mx-auto w-44" />
          <h1 className="mt-5 text-xl font-semibold">{c.welcome}, {name}</h1>
          <p className="mt-0.5 truncate text-xs opacity-60">{email}</p>
          <form onSubmit={submit} className="mt-5 space-y-3 text-left">
            <label className="block">
              <span className="text-xs font-medium opacity-70">{c.pw}</span>
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-[color:var(--brand-navy)]/20 bg-background text-foreground px-3 focus-within:border-[color:var(--brand-orange)]">
                <Lock className="h-4 w-4 opacity-50" />
                <input type="password" autoFocus required autoComplete="current-password" value={pw}
                  onChange={(e) => setPw(e.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" />
              </div>
            </label>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
            <button type="submit" disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-[color:var(--brand-cream)] disabled:opacity-60"
              style={{ background: "linear-gradient(120deg, var(--brand-orange), color-mix(in oklab, var(--brand-orange) 70%, var(--brand-navy)))" }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {c.btn}
            </button>
          </form>
          <button onClick={onSignOut} className="mt-4 text-xs opacity-60 hover:underline">{c.other}</button>
        </div>
      </div>
    </div>
  );
}
