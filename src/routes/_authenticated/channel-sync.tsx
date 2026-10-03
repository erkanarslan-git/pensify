import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { WuBookStatus } from "@/components/wubook-status";
import { usePermissions } from "@/hooks/use-permissions";
import { ACTIVE_CHANNELS, type ActiveChannel, normalizeChannel, sourceColor, sourceLabel } from "@/lib/guest-color";

export const Route = createFileRoute("/_authenticated/channel-sync")({
  head: () => ({ meta: [{ title: "Kanäle — Pensify" }] }),
  component: ChannelSyncPage,
});

const HOW: Record<ActiveChannel, string> = {
  booking: "Über WuBook",
  airbnb: "Über WuBook",
  expedia: "Über WuBook",
  check24: "Über WuBook",
  website: "Buchungsformular der Website",
  direct: "Manuell (Telefon, E-Mail, vor Ort)",
};

import { CHANNEL_SETTINGS_KEY as SETTINGS_KEY } from "@/lib/channels";

function ago(iso: string | null | undefined) {
  if (!iso) return "noch nie";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 48) return `vor ${h} Std.`;
  return new Date(iso).toLocaleDateString("de-DE");
}

function ChannelSyncPage() {
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data } = useQuery({
    queryKey: ["channels-page"],
    queryFn: async () => {
      const [res, out, conf, set] = await Promise.all([
        supabase.from("reservations").select("channel,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
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
    if (!org) return toast.error("Keine aktive Organisation");
    const value = { ...(data?.enabled ?? {}), [ch]: on };
    const { error } = await supabase.from("app_settings").upsert(
      { organization_id: org, key: SETTINGS_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: "organization_id,key" },
    );
    if (error) return toast.error(error.message);
    toast.success(on ? "Kanal aktiviert" : "Kanal deaktiviert");
    qc.invalidateQueries({ queryKey: ["channels-page"] });
    qc.invalidateQueries({ queryKey: ["channels-enabled"] });
  }

  async function resolveConflict(id: string, status: "resolved" | "ignored") {
    await supabase.from("conflict_alerts").update({ status, resolved_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["channels-page"] });
  }

  return (
    <AppShell title="Kanäle" subtitle="Woher Buchungen kommen und ob die Verbindung funktioniert">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat icon={ArrowDownToLine} label="Letzte Buchung eingegangen" value={ago(lastIn)} />
        <Stat icon={ArrowUpFromLine} label="Zuletzt an WuBook gesendet" value={ago(lastSent)} />
        <Stat icon={Clock} label="Wartet auf Versand" value={String(pending)} />
        <Stat icon={AlertTriangle} label="Fehlgeschlagen" value={String(failed)} tone={failed ? "destructive" : undefined} />
      </div>

      <WuBookStatus />

      {(data?.conflicts.length ?? 0) > 0 && (
        <div className="mt-4">
          <Section title={`Überschneidungen (${data!.conflicts.length})`} action={<Badge tone="destructive">Aktion nötig</Badge>}>
            <div className="space-y-2">
              {data!.conflicts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-md border border-destructive/40 bg-destructive/5 text-sm">
                  <div>{sourceLabel(c.incoming_channel)} · {c.check_in} → {c.check_out}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => resolveConflict(c.id, "ignored")}>Ignorieren</Button>
                    <Button size="sm" onClick={() => resolveConflict(c.id, "resolved")}>Erledigt</Button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      <div className="mt-4">
        <Section title="Buchungskanäle">
          <div className="divide-y divide-border -m-5">
            {ACTIVE_CHANNELS.map((ch) => {
              const s = stats.get(ch);
              const on = data?.enabled?.[ch] ?? true;
              return (
                <div key={ch} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: sourceColor(ch) }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{sourceLabel(ch)}</div>
                    <div className="text-xs text-muted-foreground">{HOW[ch]}</div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right hidden sm:block">
                    <div>{s?.count ?? 0} Buchungen (30 Tage)</div>
                    <div>Letzte: {ago(s?.last)}</div>
                  </div>
                  <Switch checked={on} disabled={!isAdmin} onCheckedChange={(v) => toggle(ch, v)} />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            Booking.com, Airbnb, Expedia und Check24 werden im WuBook-Konto verbunden (WuBook → Channel Manager). Pensify spricht nur mit WuBook. Ausgeschaltete Kanäle können bei „Neue Buchung“ nicht ausgewählt werden; Buchungen über WuBook kommen trotzdem an.
          </p>
        </Section>
      </div>

      <div className="mt-4">
        <Section title="Letzte Übertragungen">
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
            {outbox.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground">Noch keine Übertragungen</div>}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "destructive" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className={`text-lg font-semibold mt-1 ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
