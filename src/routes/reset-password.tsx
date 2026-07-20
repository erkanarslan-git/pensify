import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Hotel, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Pensify" },
      { name: "description", content: "Set a new password for your Pensify account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash automatically and fires PASSWORD_RECOVERY.
    // We wait briefly then check for a session.
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(!!session);
        setReady(true);
      }
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data.session);
      setReady(true);
    })();
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsDoNotMatch"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success(t("auth.passwordUpdated"));
      // Sign out so the user re-authenticates with the new password
      await supabase.auth.signOut();
      setTimeout(() => navigate({ to: "/auth" }), 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth.invalidCredentials");
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 py-12" style={{ background: "var(--gradient-soft)" }}>
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-soft p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Hotel className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">{t("app.name")}</div>
            <div className="text-xs text-muted-foreground -mt-0.5">{t("auth.resetTitle")}</div>
          </div>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto text-primary" />
            <p className="mt-3 text-sm">{t("auth.passwordUpdated")}</p>
          </div>
        ) : !hasSession ? (
          <div className="text-sm text-muted-foreground space-y-3">
            <p>{t("auth.resetInvalidLink")}</p>
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90"
            >
              {t("auth.backToSignIn")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-sm text-muted-foreground mb-2">{t("auth.resetSubtitle")}</p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("auth.newPassword")}</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t("auth.confirmPassword")}</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 shadow-soft"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("auth.updatePassword")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
