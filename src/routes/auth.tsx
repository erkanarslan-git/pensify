import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Hotel, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Sign in — StayFlow" },
      { name: "description", content: "Sign in to manage your hotel and guesthouse operations." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName, locale: i18n.language },
          },
        });
        if (error) throw error;
        toast.success(t("auth.signedUp"));
        // If email confirm disabled, session is set → go to dashboard
        const { data } = await supabase.auth.getSession();
        if (data.session) navigate({ to: "/" });
        else toast.message(t("auth.checkEmail"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(t("auth.signedIn"));
        navigate({ to: "/" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth.invalidCredentials");
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message);
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  const langs = [
    { code: "de", label: "DE" },
    { code: "en", label: "EN" },
    { code: "tr", label: "TR" },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
           style={{ background: "var(--gradient-soft)" }}>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-soft">
            <Hotel className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">{t("app.name")}</div>
            <div className="text-xs text-muted-foreground -mt-0.5">{t("app.tagline")}</div>
          </div>
        </div>
        <div>
          <h2 className="text-4xl font-semibold tracking-tight leading-tight text-foreground/90">
            {t("auth.welcomeTitle")}
          </h2>
          <p className="mt-3 text-muted-foreground max-w-md">
            {t("auth.welcomeSubtitle")}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© StayFlow</div>
      </div>

      <div className="flex flex-col">
        <div className="flex justify-end p-4 gap-1">
          {langs.map((l) => (
            <button
              key={l.code}
              onClick={() => i18n.changeLanguage(l.code)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                i18n.resolvedLanguage === l.code
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex-1 grid place-items-center px-6 pb-12">
          <div className="w-full max-w-sm">
            <div className="flex gap-1 p-1 bg-muted rounded-xl mb-6">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === m
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted-foreground"
                  }`}
                >
                  {m === "signin" ? t("auth.signInTab") : t("auth.signUpTab")}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("common.fullName")}</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full px-3 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("common.email")}</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t("common.password")}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 shadow-soft"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === "signin" ? t("common.signIn") : t("auth.createAccount")}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{t("common.or")}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button
              onClick={handleGoogle}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border bg-card font-medium text-sm hover:bg-accent disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 11v3.2h5.4c-.2 1.4-1.7 4-5.4 4-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12s4.2 9.3 9.3 9.3c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.1-.1-1.2H12z"/>
              </svg>
              {t("common.continueWithGoogle")}
            </button>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              {t("auth.termsHint")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
