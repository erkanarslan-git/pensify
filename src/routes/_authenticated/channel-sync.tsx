import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus, AlertTriangle, Link as LinkIcon, Activity } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/channel-sync")({
  head: () => ({ meta: [{ title: "Channel Sync — Pensify" }] }),
  component: ChannelSyncPage,
});

type Channel = Database["public"]["Enums"]["reservation_channel"];
type Integration = Database["public"]["Tables"]["channel_integrations"]["Row"];
type SyncJob = Database["public"]["Tables"]["sync_jobs"]["Row"];
type Conflict = Database["public"]["Tables"]["conflict_alerts"]["Row"];

const CHANNELS: { id: Channel; label: string }[] = [
  { id: "airbnb", label: "Airbnb" },
  { id: "booking", label: "Booking.com" },
  { id: "check24", label: "check24" },
  { id: "website", label: "Website" },
  { id: "ical", label: "iCal (generic)" },
];

function ChannelSyncPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [syncing, setSyncing] = useState(false);

  async function loadAll() {
    const [i, j, c, p] = await Promise.all([
      supabase.from("channel_integrations").select("*").order("created_at", { ascending: false }),
      supabase.from("sync_jobs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("conflict_alerts").select("*").eq("status", "open").order("created_at", { ascending: false }),
      supabase.from("properties").select("id,name").order("name"),
    ]);
    setIntegrations((i.data ?? []) as Integration[]);
    setJobs((j.data ?? []) as SyncJob[]);
    setConflicts((c.data ?? []) as Conflict[]);
    setProperties(p.data ?? []);
  }

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("channel-sync-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_jobs" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "conflict_alerts" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_integrations" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function toggleEnabled(row: Integration, enabled: boolean) {
    const { error } = await supabase.from("channel_integrations").update({ enabled }).eq("id", row.id);
    if (error) toast.error(error.message); else toast.success("Updated");
  }

  async function addIntegration(channel: Channel, propertyId: string, icalUrl: string) {
    if (!propertyId) return toast.error("Select a property");
    const { error } = await supabase.from("channel_integrations").insert({
      channel,
      property_id: propertyId,
      ical_url: icalUrl || null,
      enabled: true,
      direction: "both",
    });
    if (error) toast.error(error.message); else toast.success("Channel connected");
  }

  async function manualSync(row?: Integration) {
    setSyncing(true);
    try {
      if (row) {
        await supabase.from("sync_jobs").insert({
          channel: row.channel,
          direction: "import",
          property_id: row.property_id,
          integration_id: row.id,
          status: "pending",
          payload: { manual: true } as any,
        });
      }
      const res = await fetch("/api/public/sync/manual", { method: "POST" });
      const json = await res.json();
      await supabase.from("channel_integrations").update({
        last_sync_at: new Date().toISOString(), last_sync_status: "success", last_sync_error: null,
      }).eq("id", row?.id ?? "00000000-0000-0000-0000-000000000000");
      toast.success(`Sync complete (${json.processed ?? 0} jobs)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function resolveConflict(id: string, status: "resolved" | "ignored") {
    await supabase.from("conflict_alerts").update({ status, resolved_at: new Date().toISOString() }).eq("id", id);
  }

  const grouped = useMemo(() => {
    const m = new Map<Channel, Integration[]>();
    for (const i of integrations) {
      if (!m.has(i.channel)) m.set(i.channel, []);
      m.get(i.channel)!.push(i);
    }
    return m;
  }, [integrations]);

  return (
    <AppShell
      title="Channel Sync"
      subtitle="Keep availability in sync across Airbnb, Booking.com, website and iCal feeds."
      actions={
        <Button onClick={() => manualSync()} disabled={syncing} size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> Sync now
        </Button>
      }
    >
      {conflicts.length > 0 && (
        <Section title={`Conflicts (${conflicts.length})`} action={<Badge tone="destructive">Action needed</Badge>}>
          <div className="space-y-2">
            {conflicts.map((c) => (
              <div key={c.id} className="flex items-start justify-between p-3 rounded-md border border-destructive/40 bg-destructive/5">
                <div className="text-sm">
                  <div className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-destructive" /> Overlap on room {c.room_id.slice(0, 8)}</div>
                  <div className="text-muted-foreground">{c.incoming_channel} · {c.check_in} → {c.check_out}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => resolveConflict(c.id, "ignored")}>Ignore</Button>
                  <Button size="sm" onClick={() => resolveConflict(c.id, "resolved")}>Resolve</Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Tabs defaultValue="connections" className="mt-4">
        <TabsList>
          <TabsTrigger value="connections"><LinkIcon className="w-4 h-4 mr-1.5" /> Connections</TabsTrigger>
          <TabsTrigger value="logs"><Activity className="w-4 h-4 mr-1.5" /> Sync logs</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4 mt-4">
          {CHANNELS.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              rows={grouped.get(ch.id) ?? []}
              properties={properties}
              onAdd={addIntegration}
              onToggle={toggleEnabled}
              onSync={manualSync}
            />
          ))}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Section title={`Recent sync jobs (${jobs.length})`}>
            <div className="overflow-x-auto -m-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-5 py-3 font-medium">Channel</th>
                    <th className="px-5 py-3 font-medium">Direction</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                    <th className="px-5 py-3 font-medium">Attempts</th>
                    <th className="px-5 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b border-border/60">
                      <td className="px-5 py-3 capitalize">{j.channel}</td>
                      <td className="px-5 py-3">{j.direction}</td>
                      <td className="px-5 py-3">
                        <Badge tone={j.status === "success" ? "success" : j.status === "failed" ? "destructive" : j.status === "running" ? "info" : "muted"}>
                          {j.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3">{j.attempts}</td>
                      <td className="px-5 py-3 text-destructive">{j.error_message ?? ""}</td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No jobs yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ChannelCard({
  channel, rows, properties, onAdd, onToggle, onSync,
}: {
  channel: { id: Channel; label: string };
  rows: Integration[];
  properties: { id: string; name: string }[];
  onAdd: (c: Channel, p: string, url: string) => void;
  onToggle: (row: Integration, e: boolean) => void;
  onSync: (row: Integration) => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [icalUrl, setIcalUrl] = useState("");

  return (
    <Section title={channel.label} action={<Badge tone="muted">{rows.length} connected</Badge>}>
      <div className="space-y-2 mb-4">
        {rows.map((r) => {
          const prop = properties.find((p) => p.id === r.property_id);
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border border-border">
              <div className="text-sm">
                <div className="font-medium">{prop?.name ?? r.property_id}</div>
                <div className="text-xs text-muted-foreground">
                  {r.ical_url ? <span className="truncate inline-block max-w-[320px] align-bottom">{r.ical_url}</span> : "No iCal URL"}
                  {" · "}
                  {r.last_sync_at ? `Last: ${new Date(r.last_sync_at).toLocaleString()}` : "Never synced"}
                  {" · "}
                  <span className={r.last_sync_status === "success" ? "text-emerald-600 dark:text-emerald-400" : r.last_sync_status === "error" ? "text-destructive" : ""}>
                    {r.last_sync_status ?? "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Switch checked={!!r.enabled} onCheckedChange={(v) => onToggle(r, v)} />
                  <span>{r.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => onSync(r)}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sync
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2 p-3 rounded-md bg-muted/40">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground">Property</label>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-sm"
          >
            <option value="">Select property…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex-[2] min-w-[240px]">
          <label className="text-xs text-muted-foreground">iCal URL (optional for API channels)</label>
          <Input value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} placeholder="https://…/calendar.ics" />
        </div>
        <Button onClick={() => { onAdd(channel.id, propertyId, icalUrl); setIcalUrl(""); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Connect
        </Button>
      </div>
    </Section>
  );
}
