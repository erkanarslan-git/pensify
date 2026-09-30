import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus, AlertTriangle, Link as LinkIcon, Activity, Upload, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  const [rooms, setRooms] = useState<{ id: string; number: string; property_id: string }[]>([]);
  const [syncing, setSyncing] = useState(false);

  async function loadAll() {
    const [i, j, c, p, r] = await Promise.all([
      supabase.from("channel_integrations").select("*").order("created_at", { ascending: false }),
      supabase.from("sync_jobs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("conflict_alerts").select("*").eq("status", "open").order("created_at", { ascending: false }),
      supabase.from("properties").select("id,name").order("name"),
      supabase.from("rooms").select("id,number,property_id").order("number"),
    ]);
    setIntegrations((i.data ?? []) as Integration[]);
    setJobs((j.data ?? []) as SyncJob[]);
    setConflicts((c.data ?? []) as Conflict[]);
    setProperties(p.data ?? []);
    setRooms(r.data ?? []);
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
    if (error) toast.error(error.message); else toast.success("Aktualisiert");
  }

  async function deleteIntegration(row: Integration) {
    if (!confirm(`"${row.name ?? row.ical_url ?? row.channel}" gerçekten silinsin mi?`)) return;
    const { error } = await supabase.from("channel_integrations").delete().eq("id", row.id);
    if (error) toast.error(error.message); else toast.success("Silindi");
  }

  async function updateIntegration(row: Integration, patch: { name?: string | null; property_id?: string; room_id?: string | null; ical_url?: string | null }) {
    const { error } = await supabase.from("channel_integrations").update(patch).eq("id", row.id);
    if (error) toast.error(error.message); else toast.success("Güncellendi");
  }

  async function addIntegration(channel: Channel, propertyId: string, icalUrl: string, name?: string, roomId?: string) {
    if (!propertyId) return toast.error("Bir mülk seçin");
    const { error } = await supabase.from("channel_integrations").insert({
      channel,
      property_id: propertyId,
      room_id: roomId || null,
      name: name || null,
      ical_url: icalUrl || null,
      enabled: true,
      direction: "both",
    });
    if (error) toast.error(error.message); else toast.success("Kanal bağlandı");
  }

  async function bulkAdd(channel: Channel, rows: { name: string; url: string; propertyId: string; roomId?: string }[]): Promise<void> {
    const valid = rows.filter((r) => r.propertyId && r.url);
    if (valid.length === 0) { toast.error("Eşleştirilebilir satır yok"); return; }
    const { error, data } = await supabase.from("channel_integrations").insert(
      valid.map((r) => ({
        channel,
        property_id: r.propertyId,
        room_id: r.roomId || null,
        name: r.name || null,
        ical_url: r.url,
        enabled: true,
        direction: "both" as const,
      })),
    ).select("id");
    if (error) { toast.error(error.message); return; }
    toast.success(`${data?.length ?? 0} kayıt eklendi`);
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
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/public/sync/manual", {
        method: "POST",
        headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
      });
      const json = await res.json();
      if (res.status === 429) throw new Error("Bitte 1 Minute warten, bevor du erneut synchronisierst.");
      if (res.status === 401 || res.status === 403) throw new Error("Keine Berechtigung für Kanal-Sync.");
      if (!res.ok) throw new Error("Sync fehlgeschlagen.");
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
              rooms={rooms}
              onAdd={addIntegration}
              onBulkAdd={bulkAdd}
              onToggle={toggleEnabled}
              onDelete={deleteIntegration}
              onSync={manualSync}
              onUpdate={updateIntegration}
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

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function matchProperty(name: string, properties: { id: string; name: string }[]): string {
  const n = normalize(name);
  let best = ""; let bestScore = 0;
  for (const p of properties) {
    const tokens = normalize(p.name).split(" ").filter((t) => t.length > 2);
    const score = tokens.reduce((acc, t) => acc + (n.includes(t) ? t.length : 0), 0);
    if (score > bestScore) { bestScore = score; best = p.id; }
  }
  return bestScore >= 4 ? best : "";
}

function ChannelCard({
  channel, rows, properties, rooms, onAdd, onBulkAdd, onToggle, onDelete, onSync, onUpdate,
}: {
  channel: { id: Channel; label: string };
  rows: Integration[];
  properties: { id: string; name: string }[];
  rooms: { id: string; number: string; property_id: string }[];
  onAdd: (c: Channel, p: string, url: string, name?: string, roomId?: string) => void;
  onBulkAdd: (c: Channel, rows: { name: string; url: string; propertyId: string; roomId?: string }[]) => Promise<void>;
  onToggle: (row: Integration, e: boolean) => void;
  onDelete: (row: Integration) => void;
  onSync: (row: Integration) => void;
  onUpdate: (row: Integration, patch: { name?: string | null; property_id?: string; room_id?: string | null; ical_url?: string | null }) => Promise<void>;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [listingName, setListingName] = useState("");
  const [icalUrl, setIcalUrl] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkParsed, setBulkParsed] = useState<{ name: string; url: string; propertyId: string; roomId?: string }[]>([]);
  const [editing, setEditing] = useState<Integration | null>(null);
  const [editName, setEditName] = useState("");
  const [editPropertyId, setEditPropertyId] = useState("");
  const [editRoomId, setEditRoomId] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const editRooms = rooms.filter((r) => r.property_id === editPropertyId);

  function openEdit(row: Integration) {
    setEditing(row);
    setEditName(row.name ?? "");
    setEditPropertyId(row.property_id);
    setEditRoomId(row.room_id ?? "");
    setEditUrl(row.ical_url ?? "");
  }

  const roomsForProp = rooms.filter((r) => r.property_id === propertyId);

  function parseBulk(text: string) {
    // Parse: alternating name/url lines separated by blank lines. Skip blanks.
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const result: { name: string; url: string; propertyId: string; roomId?: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^https?:\/\//.test(line)) {
        const name = result.length && !result[result.length - 1].url
          ? result[result.length - 1].name
          : (i > 0 ? lines[i - 1] : "");
        if (result.length && !result[result.length - 1].url) {
          result[result.length - 1].url = line;
        } else {
          result.push({ name, url: line, propertyId: "" });
        }
      } else {
        // heading line — start a new record
        if (result.length && !result[result.length - 1].url) {
          // overwrite name if previous had no url
          result[result.length - 1].name = line;
        } else {
          result.push({ name: line, url: "", propertyId: "" });
        }
      }
    }
    // drop entries without url, auto-match property
    return result
      .filter((r) => r.url)
      .map((r) => ({ ...r, propertyId: matchProperty(r.name, properties) }));
  }

  return (
    <Section
      title={channel.label}
      action={
        <div className="flex items-center gap-2">
          <Badge tone="muted">{rows.length} bağlı</Badge>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Toplu iCal ekle
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Toplu iCal ekle — {channel.label}</DialogTitle>
              </DialogHeader>
              {bulkParsed.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    İlan adı ve iCal URL'sini alt alta yapıştırın (aralarında boş satır olabilir).
                  </p>
                  <Textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="min-h-[280px] font-mono text-xs"
                    placeholder={"Doppelzimmer in Bielefeld (Senner Hellweg)\nhttps://www.airbnb.de/calendar/ical/....ics?t=..."}
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setBulkOpen(false)}>İptal</Button>
                    <Button onClick={() => setBulkParsed(parseBulk(bulkText))}>
                      Ayrıştır ve önizle
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {bulkParsed.length} kayıt bulundu. Otomatik mülk eşleştirmesini kontrol edin ve gerekirse düzeltin.
                  </p>
                  <div className="max-h-[420px] overflow-auto border border-border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-medium">İlan</th>
                          <th className="text-left px-2 py-1.5 font-medium">Mülk</th>
                          <th className="text-left px-2 py-1.5 font-medium">Oda (ops.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkParsed.map((r, idx) => {
                          const rms = rooms.filter((x) => x.property_id === r.propertyId);
                          return (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-2 py-1.5">{r.name}</td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={r.propertyId}
                                  onChange={(e) => {
                                    const next = [...bulkParsed];
                                    next[idx] = { ...r, propertyId: e.target.value, roomId: undefined };
                                    setBulkParsed(next);
                                  }}
                                  className="w-full px-2 py-1 rounded border border-input bg-card"
                                >
                                  <option value="">— Eşleşmedi —</option>
                                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={r.roomId ?? ""}
                                  onChange={(e) => {
                                    const next = [...bulkParsed];
                                    next[idx] = { ...r, roomId: e.target.value || undefined };
                                    setBulkParsed(next);
                                  }}
                                  disabled={!r.propertyId}
                                  className="w-full px-2 py-1 rounded border border-input bg-card"
                                >
                                  <option value="">— Tümü —</option>
                                  {rms.map((rm) => <option key={rm.id} value={rm.id}>Oda {rm.number}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setBulkParsed([]); }}>Geri</Button>
                    <Button
                      onClick={async () => {
                        await onBulkAdd(channel.id, bulkParsed);
                        setBulkParsed([]); setBulkText(""); setBulkOpen(false);
                      }}
                    >
                      {bulkParsed.filter((r) => r.propertyId).length} kaydı ekle
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="space-y-2 mb-4">
        {rows.map((r) => {
          const prop = properties.find((p) => p.id === r.property_id);
          const room = r.room_id ? rooms.find((x) => x.id === r.room_id) : null;
          const missingRoom = !r.room_id;
          return (
            <div key={r.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border ${missingRoom ? "border-amber-500/60 bg-amber-500/5" : "border-border"}`}>
              <div className="text-sm min-w-0 flex-1">
                <div className="font-medium truncate flex items-center gap-2">
                  <span className="truncate">{r.name ?? prop?.name ?? r.property_id}</span>
                  {room && <span className="text-xs text-muted-foreground">Oda {room.number}</span>}
                  {missingRoom && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Oda atanmadı — senkron atlanır
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground/70">{prop?.name}</span>
                  {" · "}
                  {r.ical_url ? <span className="truncate inline-block max-w-[360px] align-bottom">{r.ical_url}</span> : "iCal URL yok"}
                  {" · "}
                  {r.last_sync_at ? `Son: ${new Date(r.last_sync_at).toLocaleString()}` : "Hiç senkron olmadı"}
                  {" · "}
                  <span className={r.last_sync_status === "success" ? "text-emerald-600 dark:text-emerald-400" : r.last_sync_status === "error" ? "text-destructive" : ""}>
                    {r.last_sync_status ?? "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Switch checked={!!r.enabled} onCheckedChange={(v) => onToggle(r, v)} />
                  <span>{r.enabled ? "Aktif" : "Pasif"}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Düzenle
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSync(r)} disabled={missingRoom}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Senkr.
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(r)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bağlantıyı düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">İlan adı</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Mülk</label>
              <select
                value={editPropertyId}
                onChange={(e) => { setEditPropertyId(e.target.value); setEditRoomId(""); }}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-sm"
              >
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Oda (senkron için zorunlu)</label>
              <select
                value={editRoomId}
                onChange={(e) => setEditRoomId(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-sm"
              >
                <option value="">— Seçin —</option>
                {editRooms.map((r) => <option key={r.id} value={r.id}>Oda {r.number}</option>)}
              </select>
              {editRooms.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Bu mülkte tanımlı oda yok. Önce Odalar sayfasından ekleyin.</p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">iCal URL</label>
              <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="mt-1 font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>İptal</Button>
            <Button
              onClick={async () => {
                if (!editing) return;
                await onUpdate(editing, {
                  name: editName || null,
                  property_id: editPropertyId,
                  room_id: editRoomId || null,
                  ical_url: editUrl || null,
                });
                setEditing(null);
              }}
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="grid gap-2 p-3 rounded-md bg-muted/40 md:grid-cols-[1fr_1fr_2fr_auto] items-end">
        <div>
          <label className="text-xs text-muted-foreground">Mülk</label>
          <select
            value={propertyId}
            onChange={(e) => { setPropertyId(e.target.value); setRoomId(""); }}
            className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-sm"
          >
            <option value="">Mülk seç…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Oda (opsiyonel)</label>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={!propertyId}
            className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-sm"
          >
            <option value="">Tümü</option>
            {roomsForProp.map((r) => <option key={r.id} value={r.id}>Oda {r.number}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">İlan adı & iCal URL</label>
          <div className="flex gap-2 mt-1">
            <Input value={listingName} onChange={(e) => setListingName(e.target.value)} placeholder="İlan adı (ops.)" className="w-1/3" />
            <Input value={icalUrl} onChange={(e) => setIcalUrl(e.target.value)} placeholder="https://…/calendar.ics" className="flex-1" />
          </div>
        </div>
        <Button
          onClick={() => {
            onAdd(channel.id, propertyId, icalUrl, listingName, roomId);
            setIcalUrl(""); setListingName("");
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Bağla
        </Button>
      </div>
    </Section>
  );
}
