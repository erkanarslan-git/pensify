import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2, Eye, EyeOff, Search, KeyRound, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { roomTypeVisual } from "@/lib/room-type-visuals";

const ROOM_STATUSES = ["available", "occupied", "cleaning_required", "cleaning_in_progress", "cleaned", "checkout_today", "maintenance"];

export const Route = createFileRoute("/_authenticated/rooms")({
  validateSearch: (s: Record<string, unknown>): { status?: string } =>
    typeof s.status === "string" && ROOM_STATUSES.includes(s.status) ? { status: s.status } : {},
  head: () => ({ meta: [
    { title: "Zimmerübersicht — Pensify" },
    { name: "description", content: "Zimmer nach Pension, Typ und Status verwalten." },
    { property: "og:title", content: "Zimmerübersicht — Pensify" },
    { property: "og:description", content: "Zimmer nach Pension, Typ und Status verwalten." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: RoomsPage,
});

export type RoomStatus = "available" | "occupied" | "cleaning_required" | "cleaning_in_progress" | "cleaned" | "checkout_today" | "maintenance";

export interface Property { id: string; name: string; address: string; city_id: string | null; organization_id: string }
export interface RoomType { id: string; name: string; code?: string; property_id: string | null }
interface City { id: string; name: string }
export interface Cleaner { id: string; full_name: string; active: boolean }
export interface Room {
  id: string;
  property_id: string;
  number: string;
  capacity: number;
  status: RoomStatus;
  floor: number | null;
  notes: string | null;
  key_code?: string | null;
  default_cleaner_id: string | null;
  room_type_id: string | null;
}

export const statusMeta: Record<RoomStatus, { tone: "success" | "warning" | "destructive" | "muted" | "info" | "primary" }> = {
  available: { tone: "success" }, occupied: { tone: "primary" }, checkout_today: { tone: "info" },
  cleaning_required: { tone: "warning" }, cleaning_in_progress: { tone: "warning" },
  cleaned: { tone: "success" }, maintenance: { tone: "destructive" },
};

export const floorLabel = (f: number | null) =>
  f == null ? "—" : f === 0 ? "EG" : `${f}.OG`;

function RoomsPage() {
  return <RoomsManager />;
}

export function RoomsManager({ propertyId }: { propertyId?: string } = {}) {
  const { t } = useTranslation();
  const [cities, setCities] = useState<City[]>([]);
  const [allProperties, setProperties] = useState<Property[]>([]);
  const [allRooms, setRooms] = useState<Room[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const initialStatus = Route.useSearch().status;
  const [filter, setFilter] = useState<RoomStatus | "all">((initialStatus as RoomStatus) ?? "all");
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState<{ propertyId: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [pFilter, setPFilter] = useState("");
  const [tFilter, setTFilter] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [ci, pr, rm, cl, rt, live] = await Promise.all([
        supabase.from("cities").select("id,name").order("name"),
        supabase.from("properties").select("id,name,address,city_id,organization_id").order("name"),
        supabase.from("rooms").select("id,property_id,number,capacity,status,floor,notes,key_code,default_cleaner_id,room_type_id")
          .order("floor", { ascending: true, nullsFirst: true }).order("number"),
        supabase.from("cleaners").select("id,full_name,active").order("full_name"),
        supabase.from("room_types").select("id,name,code,property_id").order("name"),
        supabase.from("room_operational_status").select("room_id,status"),
      ]);
      const critical = [["properties", pr.error], ["rooms", rm.error], ["cities", ci.error]] as const;
      const failed = critical.find(([, e]) => e);
      for (const [name, res] of [["cleaners", cl], ["room_types", rt], ["room_operational_status", live]] as const) {
        if (res.error) console.error(`[rooms] ${name} query failed:`, res.error.code, res.error.message);
      }
      if (failed) {
        const e = failed[1]!;
        console.error(`[rooms] ${failed[0]} query failed:`, e.code, e.message);
        setLoadError(`${failed[0]}: ${e.code ?? ""} ${e.message}`);
        setLoading(false);
        return;
      }
      setLoadError(null);
      setRoomTypes((rt.data ?? []) as RoomType[]);
      setCities((ci.data ?? []) as City[]);
      setProperties((pr.data ?? []) as Property[]);
      const liveMap = new Map((live.data ?? []).map((x) => [x.room_id, x.status]));
      setRooms(((rm.data ?? []) as Room[]).map((r) => ({ ...r, status: (liveMap.get(r.id) ?? r.status) as RoomStatus })));
      setCleaners((cl.data ?? []) as Cleaner[]);
      setLoading(false);
    })();
  }, [refreshKey]);

  const properties = propertyId ? allProperties.filter((p) => p.id === propertyId) : allProperties;
  const rooms = propertyId ? allRooms.filter((r) => r.property_id === propertyId) : allRooms;
  const needle = q.trim().toLocaleLowerCase();
  const list = rooms
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => !tFilter || (tFilter === "none" ? !r.room_type_id : r.room_type_id === tFilter))
    .filter((r) => !pFilter || r.property_id === pFilter)
    .filter((r) => {
      if (!needle) return true;
      const property = properties.find((p) => p.id === r.property_id);
      const type = roomTypes.find((rt) => rt.id === r.room_type_id);
      const cleaner = cleaners.find((c) => c.id === r.default_cleaner_id);
      return [r.number, property?.name, property?.address, type?.name, type?.code, cleaner?.full_name, r.notes, t(`status.${r.status}`)]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
    })
    .sort((a, b) => a.number.localeCompare(b.number, "de", { numeric: true }));
  const single = propertyId ? properties[0] : undefined;

  const remove = async (id: string) => {
    if (!confirm(t("rooms.confirmDelete"))) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) toast.error(t("rooms.actionFailed"));
    else { toast.success(t("rooms.deleted")); setRefreshKey((k) => k + 1); }
  };

  if (loading || loadError) {
    return (
      <AppShell title={single ? `${single.name} – Zimmer` : t("pages.rooms.title")}>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-1">
            <p className="font-medium text-destructive">{t("rooms.loadError")}</p>
            <p className="text-xs text-muted-foreground">{t("rooms.loadErrorHint")}</p>
            <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)} className="mt-2">{t("rooms.retry")}</Button>
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={single ? `${single.name} – Zimmer` : t("pages.rooms.title")}
      subtitle={t("rooms.subtitle", { rooms: rooms.length, properties: properties.length })}
      actions={
        properties.length > 0 ? (
          <Button
            onClick={() => setCreating({ propertyId: single?.id ?? properties[0].id })}
          >
            <Plus className="w-4 h-4" /> {t("rooms.newRoom")}
          </Button>
        ) : undefined
      }
    >
      {single && (
        <nav className="text-xs text-muted-foreground mb-3">
          <Link to="/properties" className="hover:underline">Pensionen</Link> / {single.name} / Zimmer
        </nav>
      )}
      <div className="mb-5 grid gap-2 rounded-lg border border-border bg-card p-3 shadow-soft sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(150px,auto))_auto]">
        <label className="relative min-w-0 sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rooms.searchPlaceholder")} className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
        </label>
        <select value={pFilter} onChange={(e) => { setPFilter(e.target.value); setTFilter(""); }} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">{t("rooms.allProperties")}</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={tFilter} onChange={(e) => setTFilter(e.target.value)} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">{t("rooms.allRoomTypes")}</option>
          <option value="none">{t("rooms.withoutRoomType")}</option>
          {roomTypes.filter((rt) => !pFilter || rt.property_id === pFilter).map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name}{!pFilter ? ` · ${properties.find((p) => p.id === rt.property_id)?.name ?? ""}` : ""}</option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as RoomStatus | "all")} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm">
          <option value="all">{t("rooms.allStatuses")} ({rooms.length})</option>
          {(Object.keys(statusMeta) as RoomStatus[]).map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)} ({rooms.filter((r) => r.status === s).length})</option>
          ))}
        </select>
        {(pFilter || tFilter || filter !== "all" || q) && (
          <Button variant="ghost" size="sm" onClick={() => { setPFilter(""); setTFilter(""); setFilter("all"); setQ(""); }}>{t("rooms.resetFilters")}</Button>
        )}
      </div>

      {properties.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-2">
          <p>Noch keine Pension angelegt.</p>
          <p className="text-muted-foreground">
            Legen Sie zuerst unter <Link to="/properties" className="text-primary underline underline-offset-2">Pensionen</Link> eine Pension an.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
        {cities.map((city) => {
          const cityProps = properties.filter((p) => p.city_id === city.id && (!pFilter || p.id === pFilter));
          if (cityProps.length === 0) return null;
          return (
            <div key={city.id}>
              <h3 className="text-sm font-semibold tracking-tight mb-2">{city.name}</h3>
              <div className="space-y-3">
                {cityProps.map((p) => {
                  const all = rooms.filter((r) => r.property_id === p.id);
                  const propRooms = list.filter((r) => r.property_id === p.id);
                  const free = all.filter((r) => r.status === "available" || r.status === "cleaned").length;
                  const dirty = all.filter((r) => r.status === "cleaning_required" || r.status === "cleaning_in_progress").length;
                  const filtering = !!(pFilter || tFilter || filter !== "all" || q);
                  if (filtering && propRooms.length === 0) return null;
                  return (
                    <details key={p.id} open={filtering || !!pFilter} className="group/d overflow-hidden rounded-lg border border-border bg-card shadow-soft">
                      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-muted/40 px-3 py-3 sm:px-4">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground transition-transform group-open/d:rotate-90">›</span>
                        <span className="min-w-0"><span className="block truncate font-display text-sm font-semibold">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.address}</span></span>
                        <span className="hidden text-xs text-muted-foreground sm:block">{t("rooms.propertySummary", { rooms: all.length, free, cleaning: dirty })}</span>
                        <Link to="/properties/$id/rooms" params={{ id: p.id }} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs hover:bg-accent">
                          {t("rooms.manage")}
                        </Link>
                      </summary>
                      {propRooms.length === 0 ? (
                        <div className="text-xs text-muted-foreground px-4 pb-3">Keine Zimmer.</div>
                      ) : (
                        <div className="divide-y divide-border/60 border-t border-border">
                          {propRooms.map((r) => {
                            const meta = statusMeta[r.status];
                            const roomType = roomTypes.find((rt) => rt.id === r.room_type_id);
                            const typeName = roomType?.name;
                            const cleaner = cleaners.find((c) => c.id === r.default_cleaner_id);
                            const visual = roomTypeVisual(roomType?.code);
                            return (
                              <div key={r.id} className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[110px_minmax(160px,1fr)_90px_minmax(140px,1fr)_120px_auto] sm:px-4">
                                <div className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${visual.marker}`} /><span className="truncate font-semibold">#{r.number}</span></div>
                                <div className="col-start-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:col-start-auto sm:text-sm"><Users className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.capacity} · {typeName ?? t("rooms.withoutRoomType")}</span></div>
                                <div className="hidden text-xs text-muted-foreground sm:block">{floorLabel(r.floor)}</div>
                                <div className="hidden truncate text-xs text-muted-foreground sm:block">{cleaner?.full_name ?? t("rooms.notAssigned")}</div>
                                <div className="row-span-2 sm:row-span-1"><Badge tone={meta.tone}>{t(`status.${r.status}`)}</Badge></div>
                                <div className="flex shrink-0 gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => setEditing(r)} title={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} title={t("common.delete")} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </div>
                            );
                           })}
                         </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      <RoomDialog
        open={!!editing || !!creating}
        room={editing}
        propertyId={creating?.propertyId}
        properties={properties}
        cleaners={cleaners}
        roomTypes={roomTypes}
        onClose={() => { setEditing(null); setCreating(null); }}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </AppShell>
  );
}

export function RoomDialog({
  open, room, propertyId, properties, cleaners, roomTypes, onClose, onSaved,
}: {
  open: boolean;
  room: Room | null;
  propertyId?: string;
  properties: Property[];
  cleaners: Cleaner[];
  roomTypes: RoomType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [floor, setFloor] = useState<string>("0");
  const [status, setStatus] = useState<RoomStatus>("available");
  const [propId, setPropId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [keyCode, setKeyCode] = useState("");
  const [defaultCleanerId, setDefaultCleanerId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [roomTypeId, setRoomTypeId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (room) {
      setNumber(room.number);
      setCapacity(room.capacity);
      setFloor(room.floor == null ? "" : String(room.floor));
      setStatus(room.status);
      setPropId(room.property_id);
      setNotes(room.notes ?? "");
      setKeyCode(room.key_code ?? "");
      setDefaultCleanerId(room.default_cleaner_id ?? "");
      setRoomTypeId(room.room_type_id ?? "");
    } else {
      setNumber("");
      setCapacity(2);
      setFloor("0");
      setStatus("available");
      setPropId(propertyId ?? properties[0]?.id ?? "");
      setNotes("");
      setKeyCode("");
      setDefaultCleanerId("");
      setRoomTypeId("");
    }
  }, [open, room, propertyId, properties]);

  const save = async () => {
    if (!number.trim() || !propId) { toast.error("Oda no ve lokasyon zorunlu"); return; }
    setSaving(true);
    const f = floor.trim() === "" ? null : Number(floor);
    if (f !== null && (!Number.isInteger(f) || f < 0 || f > 50)) {
      toast.error("Geçersiz kat"); setSaving(false); return;
    }
    const payload = {
      property_id: propId,
      number: number.trim(),
      capacity,
      floor: f,
      status,
      notes: notes.trim() || null,
      key_code: keyCode.trim() || null,
      default_cleaner_id: defaultCleanerId || null,
      room_type_id: roomTypeId || null,
      organization_id: properties.find((p) => p.id === propId)?.organization_id,
    };
    const { error } = room
      ? await supabase.from("rooms").update(payload).eq("id", room.id)
      : await supabase.from("rooms").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(room ? "Oda güncellendi" : "Oda eklendi");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{room ? "Odayı düzenle" : "Yeni oda"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Lokasyon</label>
            <select value={propId} onChange={(e) => { setPropId(e.target.value); setRoomTypeId(""); }} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Oda no</label>
              <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Kat (0 = EG)</label>
              <input type="number" min={0} max={50} value={floor} onChange={(e) => setFloor(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Kapasite</label>
              <input type="number" min={1} max={20} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Durum</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as RoomStatus)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              {(Object.keys(statusMeta) as RoomStatus[]).map((s) => (
                <option key={s} value={s}>{statusMeta[s].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Zimmertyp (Preis)</label>
            <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              <option value="">— kein Typ —</option>
              {roomTypes.filter((t) => t.property_id === propId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Standard-Reinigungskraft</label>
            <select value={defaultCleanerId} onChange={(e) => setDefaultCleanerId(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              <option value="">— atanmamış —</option>
              {cleaners.filter((c) => c.active || c.id === defaultCleanerId).map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Bei jedem Check-out wird automatisch eine Aufgabe für diese Reinigungskraft erstellt.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Schlüsselbox-Code</label>
            <input value={keyCode} onChange={(e) => setKeyCode(e.target.value)} maxLength={20} placeholder="z. B. 4821" className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm font-mono tracking-widest" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notizen</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">Abbrechen</button>
          <button onClick={save} disabled={saving} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
