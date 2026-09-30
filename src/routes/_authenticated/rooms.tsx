import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RoomTypesDialog } from "@/components/room-types-dialog";
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

type RoomStatus = "available" | "occupied" | "cleaning_required" | "cleaning_in_progress" | "cleaned" | "checkout_today" | "maintenance";

interface Property { id: string; name: string; city_id: string | null; organization_id: string }
interface RoomType { id: string; name: string; property_id: string | null }
interface City { id: string; name: string }
interface Cleaner { id: string; full_name: string; active: boolean }
interface Room {
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

const statusMeta: Record<RoomStatus, { label: string; tone: "success" | "warning" | "destructive" | "muted" | "info" | "primary" }> = {
  available: { label: "Müsait", tone: "success" },
  occupied: { label: "Dolu", tone: "primary" },
  checkout_today: { label: "Bugün Çıkış", tone: "info" },
  cleaning_required: { label: "Temizlik Bekliyor", tone: "warning" },
  cleaning_in_progress: { label: "Temizleniyor", tone: "warning" },
  cleaned: { label: "Temiz", tone: "success" },
  maintenance: { label: "Bakım", tone: "destructive" },
};

const floorLabel = (f: number | null) =>
  f == null ? "—" : f === 0 ? "EG" : `${f}.OG`;

function RoomsPage() {
  const { t } = useTranslation();
  const [cities, setCities] = useState<City[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [filter, setFilter] = useState<RoomStatus | "all">("all");
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState<{ propertyId: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [typesOpen, setTypesOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: ci }, { data: pr }, { data: rm }, { data: cl }, { data: rt }, { data: live }] = await Promise.all([
        supabase.from("cities").select("id,name").order("name"),
        supabase.from("properties").select("id,name,city_id,organization_id").order("name"),
        supabase.from("rooms").select("id,property_id,number,capacity,status,floor,notes,default_cleaner_id,room_type_id")
          .order("floor", { ascending: true, nullsFirst: true }).order("number"),
        supabase.from("cleaners").select("id,full_name,active").order("full_name"),
        supabase.from("room_types").select("id,name,property_id").order("name"),
        supabase.from("room_operational_status").select("room_id,status"),
      ]);
      setRoomTypes((rt ?? []) as RoomType[]);
      setCities((ci ?? []) as City[]);
      setProperties((pr ?? []) as Property[]);
      // Show the live status worked out from bookings + cleaning tasks.
      const liveMap = new Map((live ?? []).map((x) => [x.room_id, x.status]));
      setRooms(((rm ?? []) as Room[]).map((r) => ({ ...r, status: (liveMap.get(r.id) ?? r.status) as RoomStatus })));
      setCleaners((cl ?? []) as Cleaner[]);
    })();
  }, [refreshKey]);

  const list = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);

  const remove = async (id: string) => {
    if (!confirm("Bu odayı silmek istediğine emin misin?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Oda silindi"); setRefreshKey((k) => k + 1); }
  };

  return (
    <AppShell
      title={t("pages.rooms.title")}
      subtitle={`${rooms.length} oda · ${properties.length} lokasyon`}
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setTypesOpen(true)}
          className="px-3 py-1.5 rounded-full text-xs font-medium border border-primary text-primary hover:bg-primary/10"
        >
          Zimmertypen & Preise
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
        >
          Tümü ({rooms.length})
        </button>
        {(Object.keys(statusMeta) as RoomStatus[]).map((s) => {
          const count = rooms.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
            >
              {statusMeta[s].label} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {cities.map((city) => {
          const cityProps = properties.filter((p) => p.city_id === city.id);
          if (cityProps.length === 0) return null;
          return (
            <div key={city.id}>
              <h3 className="text-sm font-semibold tracking-tight mb-3">{city.name}</h3>
              <div className="space-y-4">
                {cityProps.map((p) => {
                  const propRooms = list.filter((r) => r.property_id === p.id);
                  return (
                    <Section
                      key={p.id}
                      title={p.name}
                      action={
                        <button
                          onClick={() => setCreating({ propertyId: p.id })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs hover:bg-accent"
                        >
                          <Plus className="w-3 h-3" /> Oda ekle
                        </button>
                      }
                    >
                      {propRooms.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-3">Bu lokasyonda oda yok.</div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {propRooms.map((r) => {
                            const meta = statusMeta[r.status];
                            return (
                              <div key={r.id} className="rounded-lg border border-border p-3 bg-card hover:shadow-elevated transition-shadow group">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center justify-center min-w-[28px] h-[18px] px-1 rounded text-[10px] font-semibold bg-accent text-accent-foreground">
                                      {floorLabel(r.floor)}
                                    </span>
                                    <span className="font-semibold">#{r.number}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                    <Users className="w-3 h-3" />{r.capacity}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                  <Badge tone={meta.tone}>{meta.label}</Badge>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditing(r)} className="p-1 rounded hover:bg-accent" title="Düzenle">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => remove(r.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive" title="Sil">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-2 text-[11px] text-muted-foreground truncate" title="Varsayılan temizlikçi">
                                  🧹 {cleaners.find((c) => c.id === r.default_cleaner_id)?.full_name ?? <span className="italic text-amber-600 dark:text-amber-400">atanmamış</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Section>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

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
      <RoomTypesDialog
        open={typesOpen}
        properties={properties}
        onClose={() => setTypesOpen(false)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </AppShell>
  );
}

function RoomDialog({
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
