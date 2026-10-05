import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2, Eye, EyeOff, Search, KeyRound, Sparkles } from "lucide-react";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<RoomStatus>("available");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

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
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const visibleRooms = list.slice((page - 1) * pageSize, page * pageSize);
  const allVisibleSelected = visibleRooms.length > 0 && visibleRooms.every((room) => selected.has(room.id));

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [q, pFilter, tFilter, filter]);

  const toggleRoom = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleVisible = () => setSelected((current) => {
    const next = new Set(current);
    if (allVisibleSelected) visibleRooms.forEach((room) => next.delete(room.id));
    else visibleRooms.forEach((room) => next.add(room.id));
    return next;
  });

  const applyBulkStatus = async (nextStatus: RoomStatus) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkSaving(true);
    const { error } = await supabase.from("rooms").update({ status: nextStatus }).in("id", ids);
    setBulkSaving(false);
    if (error) { toast.error(t("rooms.actionFailed")); return; }
    toast.success(t("rooms.bulkUpdated", { count: ids.length }));
    setSelected(new Set());
    setRefreshKey((key) => key + 1);
  };

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
      <div className="mb-3 grid gap-2 border-y border-border bg-card py-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(150px,auto))_auto]">
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
        <div className="border border-border bg-card p-4 text-sm">
          <p>{t("pensions.noPensions")}</p>
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 border border-border bg-card sm:grid-cols-4">
            {([ ["available", rooms.filter((r) => ["available", "cleaned"].includes(r.status)).length], ["occupied", rooms.filter((r) => ["occupied", "checkout_today"].includes(r.status)).length], ["cleaning_required", rooms.filter((r) => ["cleaning_required", "cleaning_in_progress"].includes(r.status)).length], ["maintenance", rooms.filter((r) => r.status === "maintenance").length] ] as const).map(([status, count]) => (
              <button key={status} onClick={() => setFilter(status)} className="border-b border-r border-border px-4 py-3 text-left last:border-r-0 sm:border-b-0"><span className="block text-xs text-muted-foreground">{t(`status.${status}`)}</span><strong className="mt-1 block font-display text-xl">{count}</strong></button>
            ))}
          </div>
          {selected.size > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 border border-foreground bg-foreground px-3 py-2 text-background"><span className="mr-auto text-sm font-medium">{t("rooms.selectedCount", { count: selected.size })}</span><select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as RoomStatus)} className="h-8 rounded-sm border border-background/30 bg-foreground px-2 text-xs">{(Object.keys(statusMeta) as RoomStatus[]).map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select><Button size="sm" variant="secondary" onClick={() => applyBulkStatus(bulkStatus)} disabled={bulkSaving}>{t("rooms.applyStatus")}</Button><Button size="sm" variant="secondary" onClick={() => applyBulkStatus("cleaning_required")} disabled={bulkSaving}><Sparkles className="h-4 w-4" />{t("rooms.sendToCleaning")}</Button></div>}
          <div className="overflow-hidden border border-border bg-card">
            {list.length === 0 ? <div className="p-5 text-sm text-muted-foreground">{t("rooms.noRooms")}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-muted"><tr className="border-b border-border text-left text-xs font-medium text-muted-foreground"><th className="w-11 px-3 py-2"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label={t("rooms.selectPage")} /></th><th className="px-3 py-2">{t("rooms.roomNumber")}</th><th className="px-3 py-2">{t("rooms.property")}</th><th className="px-3 py-2">{t("rooms.roomType")}</th><th className="px-3 py-2">{t("rooms.status")}</th><th className="px-3 py-2">{t("rooms.keyCode")}</th><th className="px-3 py-2">{t("rooms.capacity")}</th><th className="px-3 py-2">{t("rooms.floor")}</th><th className="w-24 px-3 py-2 text-right">{t("rooms.actions")}</th></tr></thead><tbody className="divide-y divide-border">{visibleRooms.map((room) => { const property = properties.find((item) => item.id === room.property_id); const roomType = roomTypes.find((item) => item.id === room.room_type_id); const codeVisible = revealedCodes.has(room.id); return <tr key={room.id} className="group transition-colors hover:bg-muted/60"><td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(room.id)} onChange={() => toggleRoom(room.id)} aria-label={t("rooms.selectRoom", { room: room.number })} /></td><td className="px-3 py-2.5 font-semibold">{room.number}</td><td className="max-w-52 px-3 py-2.5"><span className="block truncate font-medium">{property?.name ?? "—"}</span><span className="block truncate text-xs text-muted-foreground">{property?.address}</span></td><td className="px-3 py-2.5">{roomType?.name ?? t("rooms.withoutRoomType")}</td><td className="px-3 py-2.5"><Badge tone={statusMeta[room.status].tone}>{t(`status.${room.status}`)}</Badge></td><td className="px-3 py-2.5"><div className="flex items-center gap-1.5 font-mono"><span>{room.key_code ? (codeVisible ? room.key_code : "••••") : "—"}</span>{room.key_code && <Button variant="ghost" size="icon" onClick={() => setRevealedCodes((current) => { const next = new Set(current); if (next.has(room.id)) next.delete(room.id); else next.add(room.id); return next; })} title={codeVisible ? t("rooms.hideKeyCode") : t("rooms.showKeyCode")}>{codeVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</Button>}</div></td><td className="px-3 py-2.5"><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{room.capacity}</span></td><td className="px-3 py-2.5 text-muted-foreground">{floorLabel(room.floor)}</td><td className="px-3 py-2 text-right"><Button variant="ghost" size="icon" onClick={() => setEditing(room)} title={t("common.edit")}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove(room.id)} title={t("common.delete")} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></td></tr>; })}</tbody></table></div>}
          </div>
          {pageCount > 1 && <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{t("rooms.page", { page, pages: pageCount })}</span><div className="flex gap-1"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{t("rooms.previous")}</Button><Button size="sm" variant="outline" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>{t("rooms.next")}</Button></div></div>}
        </>
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
  const { t } = useTranslation();
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
  const [showKeyCode, setShowKeyCode] = useState(false);

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
      setShowKeyCode(false);
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
      setShowKeyCode(false);
    }
  }, [open, room, propertyId, properties]);

  const save = async () => {
    if (!number.trim() || !propId) { toast.error(t("rooms.required")); return; }
    setSaving(true);
    const f = floor.trim() === "" ? null : Number(floor);
    if (f !== null && (!Number.isInteger(f) || f < 0 || f > 50)) {
      toast.error(t("rooms.invalidFloor")); setSaving(false); return;
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
    if (error) { toast.error(t("rooms.actionFailed")); return; }
    toast.success(room ? t("rooms.updated") : t("rooms.created"));
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-4 pr-12 sm:px-6">
          <DialogTitle>{room ? t("rooms.editRoom") : t("rooms.newRoom")}</DialogTitle>
          <DialogDescription>{t("rooms.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(100dvh-10rem)] space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          <div>
            <label className="text-xs text-muted-foreground">{t("rooms.property")}</label>
            <select value={propId} onChange={(e) => { setPropId(e.target.value); setRoomTypeId(""); }} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("rooms.roomNumber")}</label>
              <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("rooms.floor")}</label>
              <input type="number" min={0} max={50} value={floor} onChange={(e) => setFloor(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("rooms.capacity")}</label>
              <input type="number" min={1} max={20} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("rooms.status")}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as RoomStatus)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              {(Object.keys(statusMeta) as RoomStatus[]).map((s) => (
                <option key={s} value={s}>{t(`status.${s}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("rooms.roomType")}</label>
            <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              <option value="">— {t("rooms.withoutRoomType")} —</option>
              {roomTypes.filter((t) => t.property_id === propId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("rooms.defaultCleaner")}</label>
            <select value={defaultCleanerId} onChange={(e) => setDefaultCleanerId(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
              <option value="">— {t("rooms.notAssigned")} —</option>
              {cleaners.filter((c) => c.active || c.id === defaultCleanerId).map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">{t("rooms.cleanerHint")}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("rooms.keyCode")}</label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input type={showKeyCode ? "text" : "password"} value={keyCode} onChange={(e) => setKeyCode(e.target.value)} maxLength={20} autoComplete="off" placeholder={t("rooms.keyCodePlaceholder")} className="w-full rounded-md border border-input bg-card py-2 pl-9 pr-11 font-mono text-sm" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowKeyCode((v) => !v)} className="absolute right-1 top-0.5" title={showKeyCode ? t("rooms.hideKeyCode") : t("rooms.showKeyCode")}>
                {showKeyCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("rooms.keyCodeHint")}</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("rooms.notes")}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2 border-t border-border bg-background px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={saving}>{saving ? t("rooms.saving") : t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
