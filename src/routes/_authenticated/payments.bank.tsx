import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, Landmark, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { maskIban } from "@/lib/bank/matching";
import { checkBankNow, disconnectBank } from "@/lib/bank.functions";

export const Route = createFileRoute("/_authenticated/payments/bank")({
  head: () => ({ meta: [{ title: "Banka bağlantısı — Pensify" }, { name: "description", content: "Sparkasse hesap hareketlerinden tahsilat eşleştirme ayarları." }, { property: "og:title", content: "Banka bağlantısı — Pensify" }, { property: "og:description", content: "Sparkasse hesap hareketlerinden tahsilat eşleştirme ayarları." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BankSettingsPage,
});

const fmt = (s: string | null) => s ? new Date(s).toLocaleString("de-DE", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
const statusCls: Record<string, string> = {
  not_configured: "bg-muted text-muted-foreground", connecting: "bg-info/20 text-info-foreground", connected: "bg-success/15 text-success",
  reauth_required: "bg-warning/15 text-warning", error: "bg-destructive/15 text-destructive", disconnected: "bg-muted text-muted-foreground",
};

function BankSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const perm = usePermissions();
  const canManage = perm.can("manage_bank");
  const check = useServerFn(checkBankNow);
  const disconnect = useServerFn(disconnectBank);

  const { data } = useQuery({
    queryKey: ["bank-settings"],
    queryFn: async () => {
      const [org, s, c, a] = await Promise.all([
        supabase.rpc("default_organization_id"),
        supabase.from("bank_settings").select("organization_id,auto_match_enabled,check_times").maybeSingle(),
        supabase.from("bank_connections").select("id,provider,bank_name,status,consent_expires_at,last_attempt_at,last_success_at,next_check_at").order("created_at"),
        supabase.from("bank_accounts").select("id,connection_id,iban,owner_name,currency,active"),
      ]);
      return { orgId: (org.data as string | null) ?? null, settings: s.data, connections: c.data ?? [], accounts: a.data ?? [] };
    },
  });
  const [auto, setAuto] = useState(false);
  const [times, setTimes] = useState("08:00, 13:00, 19:00");
  useEffect(() => {
    if (data?.settings) { setAuto(data.settings.auto_match_enabled); setTimes(data.settings.check_times.join(", ")); }
  }, [data?.settings]);

  const save = async () => {
    const list = times.split(",").map((x) => x.trim()).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x));
    if (!data?.orgId || list.length === 0) return toast.error(t("bank.saveErr"));
    const { error } = await supabase.from("bank_settings").upsert({ organization_id: data.orgId, auto_match_enabled: auto, check_times: list, updated_at: new Date().toISOString() });
    if (error) return toast.error(t("bank.saveErr"));
    toast.success(t("bank.saved")); qc.invalidateQueries({ queryKey: ["bank-settings"] });
  };

  const runCheck = async (id: string) => {
    const r = await check({ data: { connectionId: id } }).catch(() => ({ ok: false, reason: "sync_failed" }));
    if (r.ok) toast.success(t("bank.checkOk")); else toast.error(r.reason === "rate_limited" ? t("bank.rateLimited") : t("bank.checkFailed"));
    qc.invalidateQueries({ queryKey: ["bank-settings"] });
  };
  const runDisconnect = async (id: string) => {
    if (!window.confirm(t("bank.confirmDisconnect"))) return;
    const r = await disconnect({ data: { connectionId: id } }).catch(() => ({ ok: false }));
    if (r.ok) toast.success(t("bank.done")); else toast.error(t("bank.failed"));
    qc.invalidateQueries({ queryKey: ["bank-settings"] });
  };

  const connections = data?.connections ?? [];
  return (
    <AppShell title={t("bank.title")} subtitle={t("bank.subtitle")}>
      <Link to="/payments" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"><ArrowLeft className="w-4 h-4" />{t("bank.back")}</Link>

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 mb-4">
          <div className="flex items-center gap-2 mb-2"><Landmark className="w-5 h-5 text-primary" /><span className="font-semibold">Sparkasse</span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${statusCls.not_configured}`}>{t("bank.status.not_configured")}</span></div>
          <p className="text-sm text-muted-foreground">{t("bank.notConfiguredText")}</p>
          <div className="mt-4 text-sm font-medium">{t("bank.needTitle")}</div>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {(t("bank.need", { returnObjects: true }) as string[]).map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      ) : connections.map((c) => {
        const accs = (data?.accounts ?? []).filter((a) => a.connection_id === c.id);
        const expSoon = c.consent_expires_at && Date.parse(c.consent_expires_at) - Date.now() < 14 * 86400000;
        return (
          <div key={c.id} className="rounded-2xl border border-border bg-card p-5 mb-4">
            <div className="flex items-center gap-2 mb-3"><Landmark className="w-5 h-5 text-primary" />
              <span className="font-semibold">{c.bank_name ?? "—"}</span><span className="text-xs text-muted-foreground">· {t("bank.provider")}: {c.provider}</span>
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${statusCls[c.status] ?? ""}`}>{t(`bank.status.${c.status}`)}</span></div>
            {(c.status === "reauth_required" || expSoon) && (
              <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm mb-3"><AlertTriangle className="w-4 h-4 text-warning shrink-0" />{t("bank.reauthWarn")}</div>
            )}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">{t("bank.lastAttempt")}</dt><dd>{fmt(c.last_attempt_at) ?? t("bank.never")}</dd>
              <dt className="text-muted-foreground">{t("bank.lastSuccess")}</dt><dd>{fmt(c.last_success_at) ?? t("bank.never")}</dd>
              <dt className="text-muted-foreground">{t("bank.nextCheck")}</dt><dd>{fmt(c.next_check_at) ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("bank.consentUntil")}</dt><dd>{fmt(c.consent_expires_at) ?? "—"}</dd>
            </dl>
            <div className="mt-3 text-sm font-medium">{t("bank.accounts")}</div>
            {accs.length === 0 ? <div className="text-sm text-muted-foreground">{t("bank.noAccounts")}</div> : accs.map((a) => (
              <div key={a.id} className="text-sm font-mono">{maskIban(a.iban)} <span className="font-sans text-muted-foreground">· {a.owner_name ?? ""} · {a.currency}</span></div>
            ))}
            {canManage && c.status !== "disconnected" && (
              <div className="grid grid-cols-2 sm:flex gap-2 mt-4">
                <button disabled={c.status !== "connected"} onClick={() => runCheck(c.id)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50"><RefreshCw className="w-4 h-4" />{t("bank.checkNow")}</button>
                <button onClick={() => runDisconnect(c.id)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-destructive/40 text-destructive text-sm"><Unplug className="w-4 h-4" />{t("bank.disconnect")}</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-2xl border border-border bg-card p-5">
        {!canManage && <div className="text-sm text-muted-foreground mb-3">{t("bank.noPermission")}</div>}
        <label className="flex items-start gap-3">
          <input type="checkbox" disabled={!canManage} checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-1 w-5 h-5" />
          <span><span className="font-medium">{t("bank.autoMatch")}</span><span className="block text-xs text-muted-foreground mt-0.5">{t("bank.autoMatchHint")}</span></span>
        </label>
        <label className="text-xs text-muted-foreground mt-4 block">{t("bank.checkTimes")}</label>
        <input disabled={!canManage} value={times} onChange={(e) => setTimes(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-base" />
        {canManage && <button onClick={save} className="mt-4 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">{t("bank.save")}</button>}
      </div>
    </AppShell>
  );
}
