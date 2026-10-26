import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import { legacyText } from "@/i18n/legacy-text";
import { displayLocale } from "@/i18n/legacy-ui";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Clock, LayoutDashboard, PlugZap, FlaskConical, History, LockKeyhole, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WuBookStatus } from "@/components/wubook-status";
import { WuBookTestPanel } from "@/components/wubook-test-panel";
import { WuBookPilotPanel } from "@/components/wubook-pilot-panel";
import { usePermissions } from "@/hooks/use-permissions";
import { ACTIVE_CHANNELS, type ActiveChannel, normalizeChannel, sourceColor, sourceLabel } from "@/lib/guest-color";

export const Route = createFileRoute("/_authenticated/channel-sync")({
  head: () => ({ meta: [{ title: "Kanäle — Pension Highway" }, { name: "description", content: "Kanalverbindungen und Übertragungen in Pension Highway prüfen." }, { property: "og:title", content: "Kanäle — Pension Highway" }, { property: "og:description", content: "Kanalverbindungen und Übertragungen in Pension Highway prüfen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ChannelSyncPage,
});

const HOW: Record<ActiveChannel, string> = {
  booking: 'Über WuBook',
  airbnb: 'Über WuBook',
  expedia: 'Über WuBook',
  check24: 'Über WuBook',
  website: 'Buchungsformular der Website',
  direct: 'Manuell (Telefon, E-Mail, vor Ort)',
};

import { CHANNEL_SETTINGS_KEY as SETTINGS_KEY } from "@/lib/channels";

function ago(iso: string | null | undefined) {
  if (!iso) return legacyText('noch nie');
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return legacyText('gerade eben');
  if (m < 60) return i18n.t("legacyUi.minutesAgo", { count: m });
  const h = Math.round(m / 60);
  if (h < 48) return i18n.t("legacyUi.hoursAgo", { count: h });
  return new Date(iso).toLocaleDateString(displayLocale());
}

function ChannelSyncPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data } = useQuery({
    queryKey: ["channels-page"],
    queryFn: async () => {
      const [res, out, conf, set] = await Promise.all([
        supabase.from("reservations").select("channel,created_at").gte("created_at", since).is("deleted_at", null).order("created_at", { ascending: false }).limit(2000),
        supabase.from("integration_outbox").select("id,event,status,created_at,sent_at,last_error").order("created_at", { ascending: false }).limit(30),
        supabase.from("conflict_alerts").select("id,incoming_channel,check_in,check_out").eq("status", "open"),
        supabase.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle(),
      ]);
      return {
        reservations: res.data ?? [],
        outbox: out.data ?? [],
        conflicts: conf.data ?? [],
        enabled: (set.data?.value ?? {}) as Partial<Record<ActiveChannel, boolean>>,
      };
    },
  });

  const stats = new Map<ActiveChannel, { count: number; last: string | null }>();
  for (const r of data?.reservations ?? []) {
    const ch = normalizeChannel(r.channel);
    const s = stats.get(ch) ?? { count: 0, last: null };
    s.count++;
    if (!s.last) s.last = r.created_at;
    stats.set(ch, s);
  }
  const outbox = data?.outbox ?? [];
  const lastSent = outbox.find((o) => o.sent_at)?.sent_at ?? null;
  const lastIn = data?.reservations?.[0]?.created_at ?? null;
  const pending = outbox.filter((o) => o.status === "pending" || o.status === "retry").length;
  const failed = outbox.filter((o) => o.status === "failed").length;

  async function toggle(ch: ActiveChannel, on: boolean) {
    const { data: org } = await supabase.rpc("active_organization_id");
    if (!org) return toast.error(legacyText('Keine aktive Organisation'));
    const value = { ...(data?.enabled ?? {}), [ch]: on };
    const { error } = await supabase.from("app_settings").upsert(
      { organization_id: org, key: SETTINGS_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: "organization_id,key" },
    );
    if (error) return toast.error(error.message);
    toast.success(on ? legacyText('Kanal aktiviert') : legacyText('Kanal deaktiviert'));
    qc.invalidateQueries({ queryKey: ["channels-page"] });
    qc.invalidateQueries({ queryKey: ["channels-enabled"] });
  }

  async function resolveConflict(id: string, status: "resolved" | "ignored") {
    await supabase.from("conflict_alerts").update({ status, resolved_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["channels-page"] });
  }

  return (
    <AppShell title={legacyText('Kanal-Synchronisierung')} subtitle={legacyText('Buchungskanäle & Verbindungsstatus')}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat icon={ArrowDownToLine} label={legacyText('Letzte Buchung')} value={ago(lastIn)} highlight />
        <Stat icon={ArrowUpFromLine} label={legacyText('Letzter Versand')} value={ago(lastSent)} />
        <Stat icon={Clock} label={legacyText('Warteschlange')} value={String(pending)} />
        <Stat icon={AlertTriangle} label={legacyText('Fehlgeschlagen')} value={String(failed)} tone={failed ? "destructive" : undefined} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <LockKeyhole className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-sm text-primary">{legacyText('Live-Versand deaktiviert')}</p>
            <p className="text-xs text-muted-foreground">{legacyText('Keine Preise oder Verfügbarkeiten werden an Buchungsportale gesendet.')}</p>
          </div>
        </div>
        <Badge tone="muted">{legacyText('Pilotbetrieb')}</Badge>
      </div>

      <Tabs defaultValue="overview">
        <TabsList aria-label={legacyText('Kanalbereiche')} className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 gap-1 bg-primary/5 p-1 mb-5">
          {[
            { value: "overview", label: legacyText('Übersicht'), icon: LayoutDashboard },
            ...(isAdmin ? [
              { value: "connection", label: legacyText('Verbindung'), icon: PlugZap },
              { value: "tests", label: legacyText('Diagnose'), icon: FlaskConical },
            ] : []),
            { value: "history", label: legacyText('Verlauf'), icon: History },
          ].map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-2 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Icon className="h-4 w-4" />{label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="space-y-5">
          <WuBookStatus />

      {(data?.conflicts.length ?? 0) > 0 && (
        <div className="mt-4">
          <Section title={t("legacyUi.conflicts", { count: data?.conflicts.length ?? 0 })} action={<Badge tone="destructive">{legacyText('Aktion nötig')}</Badge>}>
            <div className="space-y-2">
              {data?.conflicts.map((c) => (
                <div key={c.id} className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-md border border-destructive/40 bg-destructive/5 text-sm">
                  <div>{sourceLabel(c.incoming_channel, key => t(key))} · {c.check_in} → {c.check_out}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => resolveConflict(c.id, "ignored")}>{legacyText('Ignorieren')}</Button>
                    <Button size="sm" onClick={() => resolveConflict(c.id, "resolved")}>{legacyText('Erledigt')}</Button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      <div className="mt-4">
        <Section title={legacyText('Buchungskanäle')}>
          <div className="divide-y divide-border -m-5">
            {ACTIVE_CHANNELS.map((ch) => {
              const s = stats.get(ch);
              const on = data?.enabled?.[ch] ?? true;
              return (
                <div key={ch} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: sourceColor(ch) }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{sourceLabel(ch, key => t(key))}</div>
                    <div className="text-xs text-muted-foreground">{legacyText(HOW[ch])}</div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right hidden sm:block">
                    <div>{t("legacyUi.channelBookings", { count: s?.count ?? 0 })}</div>
                    <div>{t("legacyUi.last", { time: ago(s?.last) })}</div>
                  </div>
                  <Switch aria-label={t("legacyUi.offerChannel", { channel: sourceLabel(ch, key => t(key)) })} checked={on} disabled={!isAdmin} onCheckedChange={(v) => toggle(ch, v)} />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-6">{legacyText('Manuelle Buchungsauswahl · Eingehende WuBook-Buchungen bleiben unverändert.')}</p>
        </Section>
      </div>

        </TabsContent>
        {isAdmin && <TabsContent value="connection" className="space-y-5">
          <WuBookPilotPanel />
        </TabsContent>}
        {isAdmin && <TabsContent value="tests" className="space-y-5">
          <WuBookTestPanel />
        </TabsContent>}
        <TabsContent value="history">
        <Section title={legacyText('Letzte Übertragungen')}>
          <div className="divide-y divide-border -m-5">
            {outbox.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{o.event}</div>
                  {o.last_error && <div className="text-xs text-destructive truncate">{o.last_error}</div>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{ago(o.sent_at ?? o.created_at)}</span>
                  <Badge tone={o.status === "sent" ? "success" : o.status === "failed" ? "destructive" : "muted"}>{o.status}</Badge>
                </div>
              </div>
            ))}
            {outbox.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground">{legacyText('Noch keine Übertragungen')}</div>}
          </div>
        </Section>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, tone, highlight }: { icon: LucideIcon; label: string; value: string; tone?: "destructive"; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 min-w-0 ${highlight ? "brand-tile" : "border border-border bg-card"}`}>
      <div className={`flex items-center gap-2 text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}><Icon className="w-4 h-4 shrink-0" />{label}</div>
      <div className={`text-xl font-semibold mt-2 break-words ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
