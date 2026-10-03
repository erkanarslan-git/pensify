import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({ meta: [{ title: "Rooms — Pensify" }] }),
  component: RoomsPage,
});

export type RoomStatus = "available" | "occupied" | "cleaning_required" | "cleaning_in_progress" | "cleaned" | "checkout_today" | "maintenance";

export interface Property { id: string; name: string; city_id: string | null; organization_id: string }
export interface RoomType { id: string; name: string; property_id: string | null }
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
  default_cleaner_id: string | null;
  room_type_id: string | null;
}

export const statusMeta: Record<RoomStatus, { label: string; tone: "success" | "warning" | "destructive" | "muted" | "info" | "primary" }> = {
  available: { label: "Müsait", tone: "success" },
  occupied: { label: "Dolu", tone: "primary" },
  checkout_today: { label: "Bugün Çıkış", tone: "info" },
  cleaning_required: { label: "Temizlik Bekliyor", tone: "warning" },
  cleaning_in_progress: { label: "Temizleniyor", tone: "warning" },
  cleaned: { label: "Temiz", tone: "success" },
  maintenance: { label: "Bakım", tone: "destructive" },
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
  const [filter, setFilter] = useState<RoomStatus | "all">("all");
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
        supabase.from("properties").select("id,name,city_id,organization_id").order("name"),
        supabase.from("rooms").select("id,property_id,number,capacity,status,floor,notes,default_cleaner_id,room_type_id")
          .order("floor", { ascending: true, nullsFirst: true }).order("number"),
        supabase.from("cleaners").select("id,full_name,active").order("full_name"),
        supabase.from("room_types").select("id,name,property_id").order("name"),
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
  const list = rooms
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => !tFilter || (tFilter === "none" ? !r.room_type_id : r.room_type_id === tFilter))
    .filter((r) => !q.trim() || r.number.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.number.localeCompare(b.number, "de", { numeric: true }));
  const single = propertyId ? properties[0] : undefined;

  const remove = async (id: string) => {
    if (!confirm("Bu odayı silmek istediğine emin misin?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Oda silindi"); setRefreshKey((k) => k + 1); }
  };

  if (loading || loadError) {
    return (
      <AppShell title={single ? `${single.name} – Zimmer` : t("pages.rooms.title")}>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-1">
            <p className="font-medium text-destructive">Zimmerdaten konnten nicht geladen werden.</p>
            <p className="text-xs text-muted-foreground">{loadError}</p>
            <button onClick={() => setRefreshKey((k) => k + 1)} className="mt-2 px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent">Erneut versuchen</button>
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title={single ? `${single.name} – Zimmer` : t("pages.rooms.title")}
      subtitle={`${rooms.length} Zimmer · ${properties.length} Pensionen`}
      actions={
        properties.length > 0 ? (
          <button
            onClick={() => setCreating({ propertyId: single?.id ?? properties[0].id })}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Neues Zimmer
          </button>
        ) : undefined
      }
    >
      {single && (
        <nav className="text-xs text-muted-foreground mb-3">
          <Link to="/properties" className="hover:underline">Pensionen</Link> / {single.name} / Zimmer
        </nav>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-border bg-card p-2">
        <select value={pFilter} onChange={(e) => { setPFilter(e.target.value); setTFilter(""); }} className="px-2 py-1.5 rounded-md border border-input bg-card text-sm">
          <option value="">Alle Pensionen</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={tFilter} onChange={(e) => setTFilter(e.target.value)} className="px-2 py-1.5 rounded-md border border-input bg-card text-sm">
          <option value="">Alle Zimmertypen</option>
          <option value="none">Ohne Zimmertyp</option>
          {roomTypes.filter((rt) => !pFilter || rt.property_id === pFilter).map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name}{!pFilter ? ` · ${properties.find((p) => p.id === rt.property_id)?.name ?? ""}` : ""}</option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as RoomStatus | "all")} className="px-2 py-1.5 rounded-md border border-input bg-card text-sm">
          <option value="all">Alle Status ({rooms.length})</option>
          {(Object.keys(statusMeta) as RoomStatus[]).map((s) => (
            <option key={s} value={s}>{statusMeta[s].label} ({rooms.filter((r) => r.status === s).length})</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zimmer-Nr. suchen" className="px-2 py-1.5 rounded-md border border-input bg-card text-sm w-40" />
        {(pFilter || tFilter || filter !== "all" || q) && (
          <button onClick={() => { setPFilter(""); setTFilter(""); setFilter("all"); setQ(""); }} className="text-xs text-muted-foreground hover:underline">Filter zurücksetzen</button>
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
              <div className="space-y-2">
                {cityProps.map((p) => {
                  const all = rooms.filter((r) => r.property_id === p.id);
                  const propRooms = list.filter((r) => r.property_id === p.id);
                  const free = all.filter((r) => r.status === "available" || r.status === "cleaned").length;
                  const dirty = all.filter((r) => r.status === "cleaning_required" || r.status === "cleaning_in_progress").length;
                  const filtering = !!(pFilter || tFilter || filter !== "all" || q);
                  if (filtering && propRooms.length === 0) return null;
                  return (
                    <details key={p.id} open={filtering || !!pFilter} className="rounded-xl border border-border bg-card group/d">
                      <summary className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer list-none">
                        <span className="text-muted-foreground transition-transform group-open/d:rotate-90">›</span>
                        <span className="font-semibold flex-1 min-w-[160px]">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{all.length} Zimmer · <span className="text-foreground font-medium">{free} frei</span> · {dirty} Reinigung</span>
                        <Link to="/properties/$id/rooms" params={{ id: p.id }} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs hover:bg-accent">
                          Zimmer verwalten
                        </Link>
                      </summary>
                      {propRooms.length === 0 ? (
                        <div className="text-xs text-muted-foreground px-4 pb-3">Keine Zimmer.</div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 px-4 pb-4">
                          {propRooms.map((r) => {
                            const meta = statusMeta[r.status];
                            const typeName = roomTypes.find((rt) => rt.id === r.room_type_id)?.name;
                            return (
                              <div key={r.id} className="rounded-lg border border-border p-2.5 bg-background">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-sm">#{r.number} <span className="text-[10px] font-normal text-muted-foreground">{floorLabel(r.floor)}</span></span>
                                  <div className="flex">
                                    <button onClick={() => setEditing(r)} className="p-1 rounded hover:bg-accent" title="Bearbeiten"><Pencil className="w-3 h-3" /></button>
                                    <button onClick={() => remove(r.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive" title="Löschen"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                  <Users className="w-3 h-3" />{r.capacity} · {typeName ?? "ohne Typ"}
                                </div>
                                <div className="mt-1.5"><Badge tone={meta.tone}>{meta.label}</Badge></div>
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
      setDefaultCleanerId(room.default_cleaner_id ?? "");
      setRoomTypeId(room.room_type_id ?? "");
    } else {
      setNumber("");
      setCapacity(2);
      setFloor("0");
      setStatus("available");
      setPropId(propertyId ?? properties[0]?.id ?? "");
      setNotes("");
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
            <label className="text-xs text-muted-foreground">Varsayılan temizlikçi</label>
            <select value={defaultCleanerId} onChange={(e) => setDefaultCleanerId(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              <option value="">— atanmamış —</option>
              {cleaners.filter((c) => c.active || c.id === defaultCleanerId).map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Her çıkışta bu temizlikçiye otomatik görev oluşturulur.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notlar</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">İptal</button>
          <button onClick={save} disabled={saving} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
