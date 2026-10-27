import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { enablePush, pushConfigured } from "@/lib/push-client";
import { registerPushToken, unregisterPushToken } from "@/lib/push.functions";

const TOKEN_KEY = "pension-highway.push-token";

/** Card that lets a signed-in user turn push notifications on/off for this device. */
export function PushEnableCard() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY),
  );
  const [message, setMessage] = useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await enablePush();
      if (result.status === "registered") {
        await registerPushToken({ data: { token: result.token, userAgent: navigator.userAgent } });
        window.localStorage.setItem(TOKEN_KEY, result.token);
        setToken(result.token);
      } else if (result.status === "open-in-new-tab") {
        setMessage(t("push.openInNewTab"));
      } else if (result.status === "denied") {
        setMessage(t("push.denied"));
      } else if (result.status === "unsupported") {
        setMessage(t("push.unsupported"));
      } else {
        setMessage(t("push.notConfigured"));
      }
    } catch {
      toast.error(t("push.failed"));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await unregisterPushToken({ data: { token } });
      window.localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    } catch {
      toast.error(t("push.failed"));
    } finally {
      setBusy(false);
    }
  };

  const configured = pushConfigured();

  return (
    <div className="rounded-xl border border-border bg-card shadow-soft p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-9 h-9 shrink-0 rounded-md grid place-items-center brand-tile shadow-sm">
          {token ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t("push.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("push.subtitle")}</p>
        </div>
        {token ? (
          <button
            onClick={disable}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            <BellOff className="w-4 h-4" /> {t("push.disable")}
          </button>
        ) : (
          <button
            onClick={enable}
            disabled={busy || !configured}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Bell className="w-4 h-4" /> {t("push.enable")}
          </button>
        )}
      </div>
      {token && <p className="mt-2 text-xs text-success">{t("push.enabled")}</p>}
      {!configured && !token && <p className="mt-2 text-xs text-muted-foreground">{t("push.notConfigured")}</p>}
      {message && <p className="mt-2 text-xs text-warning">{message}</p>}
    </div>
  );
}
