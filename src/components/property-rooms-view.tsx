import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Users, Layers } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { usePermissions } from "@/hooks/use-permissions";
import { AppShell, Badge } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  RoomDialog, statusMeta, floorLabel,
  type Room, type RoomStatus, type Cleaner, type Property, type RoomType,
} from "@/routes/_authenticated/rooms";

interface TypeFull { id: string; name: string; code: string; capacity: number; property_id: string | null; planId: string | null; price: number | null }
interface Avail { room_type_id: string; total: number; booked: number; free: number }

const input = "w-full px-3 py-2 rounded-md border border-input bg-card text-sm";
const btn = "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-xs hover:bg-accent";
/** Map DB/RPC errors to safe, translated messages. Raw details go to the console only. */
export function friendlyError(t: TFunction, err: { code?: string; message?: string } | null | undefined): string {
  if (err) console.error("[property-rooms]", err);
  const msg = err?.message ?? "";
  const known = ["invalid_name","invalid_capacity","invalid_price","capacity_below_rooms","invalid_count","invalid_number","invalid_floor","duplicate_number","number_taken","forbidden"];
  const hit = known.find((k) => msg.includes(k));
  if (hit) return t(`propertyRooms.err.${hit}`);
  if (msg.includes("not_found") || err?.code === "P0002") return t("propertyRooms.err.not_found");
  if (err?.code === "42501") return t("propertyRooms.err.forbidden");
  if (err?.code === "23503") return t("propertyRooms.err.in_use");
  if (err?.code === "23505") return t("propertyRooms.err.number_taken");
  return t("propertyRooms.err.generic");
}

const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export function PropertyRoomsView({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canManage = perms.can("manage_rooms");
  const [partial, setPartial] = useState(false);
  const [property, setProperty] = useState<Property | null>(null);
  const [types, setTypes] = useState<TypeFull[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [avail, setAvail] = useState<Record<string, Avail>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeDlg, setTypeDlg] = useState<TypeFull | "new" | null>(null);
  const [bulkFor, setBulkFor] = useState<TypeFull | null>(null);
  const [editing, setEditing] = useState<Room | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pr, rt, rp, rm, cl, live, av] = await Promise.all([
      supabase.from("properties").select("id,name,city_id,organization_id").eq("id", propertyId).maybeSingle(),
      supabase.from("room_types").select("id,name,code,capacity,property_id").eq("property_id", propertyId).order("capacity").order("name"),
      supabase.from("rate_plans").select("id,room_type_id,base_price,created_at").eq("property_id", propertyId).eq("active", true).order("created_at"),
      supabase.from("rooms").select("id,property_id,number,capacity,status,floor,notes,default_cleaner_id,room_type_id").eq("property_id", propertyId).order("number"),
      supabase.from("cleaners").select("id,full_name,active").order("full_name"),
      supabase.from("room_operational_status").select("room_id,status"),
      supabase.rpc("room_type_availability", { _property: propertyId, _date: todayStr() }),
    ]);
    // Critical queries: property, room types, rooms. Without them the page cannot render.
    const fail = [pr, rt, rm].find((r) => r.error);
    if (fail?.error || !pr.data) {
      if (fail?.error) console.error("[property-rooms] load", fail.error);
      setError(fail?.error ? t("propertyRooms.loadErrorHint") : t("propertyRooms.notFound"));
      setLoading(false);
      return;
    }
    // Secondary queries: rate plans, cleaners, live status, availability. Show page with a warning.
    const soft = [rp, cl, live, av].filter((r) => r.error);
    soft.forEach((r) => console.error("[property-rooms] load (secondary)", r.error));
    setPartial(soft.length > 0);
    setError(null);
    setProperty(pr.data as Property);
    setTypes((rt.data ?? []).map((t) => {
      const p = (rp.data ?? []).find((x) => x.room_type_id === t.id);
      return { ...t, planId: p?.id ?? null, price: p ? Number(p.base_price) : null };
    }));
    const liveMap = new Map((live.data ?? []).map((x) => [x.room_id, x.status]));
    setRooms(((rm.data ?? []) as Room[])
      .map((r) => ({ ...r, status: (liveMap.get(r.id) ?? r.status) as RoomStatus }))
      .sort((a, b) => a.number.localeCompare(b.number, "de", { numeric: true })));
    setCleaners((cl.data ?? []) as Cleaner[]);
    setAvail(Object.fromEntries(((av.data ?? []) as Avail[]).map((a) => [a.room_type_id, a])));
    setLoading(false);
  }, [propertyId, t]);

  useEffect(() => { load(); }, [load]);

  const assignType = async (roomId: string, typeId: string) => {
    const { error } = await supabase.from("rooms").update({ room_type_id: typeId || null }).eq("id", roomId);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(t("propertyRooms.typeAssigned"));
    load();
  };
  const removeRoom = async (id: string) => {
    if (!confirm(t("propertyRooms.confirmDeleteRoom"))) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(t("propertyRooms.roomDeleted"));
    load();
  };

  const title = property ? `${property.name} – ${t("propertyRooms.title")}` : t("propertyRooms.title");
  if (loading && !property) return <AppShell title={title}><div className="text-sm text-muted-foreground">{t("propertyRooms.loading")}</div></AppShell>;
  if (error || !property) {
    return (
      <AppShell title={title}>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-1">
          <p className="font-medium text-destructive">{t("propertyRooms.loadError")}</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button onClick={load} className={`${btn} mt-2`}>{t("propertyRooms.retry")}</button>
        </div>
      </AppShell>
    );
  }

  const untyped = rooms.filter((r) => !r.room_type_id || !types.some((t) => t.id === r.room_type_id));
  const totalFree = Object.values(avail).reduce((s, a) => s + a.free, 0);

  const roomRow = (r: Room, showAssign: boolean) => {
    const meta = statusMeta[r.status];
    return (
      <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-border first:border-t-0 text-sm">
        <span className="font-semibold w-12">#{r.number}</span>
        <span className="text-xs text-muted-foreground w-10">{floorLabel(r.floor)}</span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-[120px]">
          🧹 {cleaners.find((c) => c.id === r.default_cleaner_id)?.full_name ?? "—"}
        </span>
        {showAssign && canManage && (
          <select defaultValue="" onChange={(e) => e.target.value && assignType(r.id, e.target.value)} className="px-2 py-1 rounded-md border border-input bg-card text-xs">
            <option value="">{t("propertyRooms.assignType")}</option>
            {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name} ({t("propertyRooms.persons", { n: ty.capacity })})</option>)}
          </select>
        )}
        {canManage && (
          <div className="flex gap-1">
            <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-accent" title={t("propertyRooms.edit")} aria-label={t("propertyRooms.edit")}><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => removeRoom(r.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title={t("propertyRooms.delete")} aria-label={t("propertyRooms.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell
      title={title}
      subtitle={t("propertyRooms.subtitle", { types: types.length, rooms: rooms.length, free: totalFree })}
      actions={canManage ? (
        <button onClick={() => setTypeDlg("new")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> {t("propertyRooms.addType")}
        </button>
      ) : undefined}
    >
      <nav className="text-xs text-muted-foreground mb-4">
        <Link to="/properties" className="hover:underline">{t("propertyRooms.breadcrumb")}</Link> / {property.name} / {t("propertyRooms.title")}
      </nav>
      {!perms.loading && !canManage && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground mb-4">{t("propertyRooms.noPermission")}</div>
      )}
      {partial && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs mb-4 flex items-center gap-2">
          <span className="flex-1">{t("propertyRooms.partialError")}</span>
          <button onClick={load} className={btn}>{t("propertyRooms.retry")}</button>
        </div>
      )}

      {types.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-5 text-sm mb-4 space-y-2">
          <p className="font-medium">{t("propertyRooms.noTypes")}</p>
          <p className="text-muted-foreground text-xs">{t("propertyRooms.noTypesHint")}</p>
          {canManage && <button onClick={() => setTypeDlg("new")} className={btn}><Plus className="w-3 h-3" /> {t("propertyRooms.addType")}</button>}
        </div>
      )}

      <div className="space-y-4">
        {types.map((ty) => {
          const list = rooms.filter((r) => r.room_type_id === ty.id);
          const a = avail[ty.id];
          return (
            <div key={ty.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/40">
                <Layers className="w-4 h-4 text-primary" />
                <div className="flex-1 min-w-[160px]">
                  <div className="font-semibold">{ty.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{t("propertyRooms.persons", { n: ty.capacity })}</span>
                    <span>· {ty.price != null ? t("propertyRooms.perNight", { price: ty.price.toFixed(2) }) : t("propertyRooms.noPrice")}</span>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold text-sm">{t("propertyRooms.roomCount", { n: list.length })}</div>
                  <div className="text-muted-foreground">{t("propertyRooms.freeToday")} <span className="font-semibold text-foreground">{a?.free ?? list.length}</span></div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button onClick={() => setBulkFor(ty)} className={btn}><Plus className="w-3 h-3" /> {t("propertyRooms.addRooms")}</button>
                    <button onClick={() => setTypeDlg(ty)} className="p-1.5 rounded hover:bg-accent" title={t("propertyRooms.editType")} aria-label={t("propertyRooms.editType")}><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              {list.length === 0
                ? <div className="px-4 py-3 text-xs text-muted-foreground">{t("propertyRooms.noRoomsOfType")}</div>
                : list.map((r) => roomRow(r, false))}
            </div>
          );
        })}

        {untyped.length > 0 && (
          <div className="rounded-xl border border-dashed border-border overflow-hidden">
            <div className="px-4 py-3 bg-muted/20">
              <div className="font-semibold text-sm">{t("propertyRooms.untyped", { n: untyped.length })}</div>
              <div className="text-xs text-muted-foreground">
                {types.length ? t("propertyRooms.untypedHint") : t("propertyRooms.untypedHintNoTypes")}
              </div>
            </div>
            {untyped.map((r) => roomRow(r, types.length > 0))}
          </div>
        )}
      </div>

      <TypeDialog
        value={canManage ? typeDlg : null}
        property={property}
        onClose={() => setTypeDlg(null)}
        onSaved={load}
        roomCount={typeDlg && typeDlg !== "new" ? rooms.filter((r) => r.room_type_id === typeDlg.id).length : 0}
      />
      <BulkRoomsDialog type={canManage ? bulkFor : null} property={property} existing={rooms} onClose={() => setBulkFor(null)} onSaved={load} />
      <RoomDialog
        open={canManage && !!editing}
        room={editing}
        properties={[property]}
        cleaners={cleaners}
        roomTypes={types as RoomType[]}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </AppShell>
  );
}

function TypeDialog({ value, property, roomCount, onClose, onSaved }: {
  value: TypeFull | "new" | null; property: Property; roomCount: number; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const editing = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setName(editing?.name ?? "");
    setCapacity(editing?.capacity ?? 2);
    setPrice(editing?.price != null ? String(editing.price) : "");
  }, [value]);

  const save = async () => {
    const p = Number(price);
    if (!name.trim()) return toast.error(t("propertyRooms.err.invalid_name"));
    if (price === "" || !(p >= 0)) return toast.error(t("propertyRooms.err.invalid_price"));
    if (!(capacity >= 1 && capacity <= 20)) return toast.error(t("propertyRooms.err.invalid_capacity"));
    setBusy(true);
    // Atomic: room type + standard rate plan in one server-side transaction (permission checked in DB).
    const { error } = await supabase.rpc("save_room_type_with_plan", {
      _property_id: property.id, _room_type_id: editing?.id ?? null, _name: name.trim(), _capacity: capacity, _price: p,
    } as never);
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(editing ? t("propertyRooms.typeSaved") : t("propertyRooms.typeCreated"));
    onSaved(); onClose();
  };

  const remove = async () => {
    if (!editing) return;
    if (roomCount > 0) return toast.error(t("propertyRooms.typeHasRooms"));
    if (!confirm(t("propertyRooms.confirmDeleteType", { name: editing.name }))) return;
    setBusy(true);
    const { error: e1 } = await supabase.from("rate_plans").delete().eq("room_type_id", editing.id);
    if (e1) { setBusy(false); return toast.error(friendlyError(t, e1)); }
    const { error } = await supabase.from("room_types").delete().eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(t("propertyRooms.typeDeleted"));
    onSaved(); onClose();
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t("propertyRooms.editType") : t("propertyRooms.addType")}</DialogTitle>
          <DialogDescription>{t("propertyRooms.typeDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">{t("propertyRooms.name")}</label>
            <input className={input} placeholder={t("propertyRooms.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {[["Einzelzimmer", 1], ["Doppelzimmer", 2], ["Dreibettzimmer", 3], ["Vierbettzimmer", 4]].map(([n, c]) => (
                <button key={n} type="button" onClick={() => { setName(String(n)); setCapacity(Number(c)); }} className="px-2 py-0.5 rounded-full border border-border text-[11px] hover:bg-accent">{n}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">{t("propertyRooms.maxPersons")}</label>
              <input className={input} type="number" min={1} max={20} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("propertyRooms.pricePerNight")}</label>
              <input className={input} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? <button onClick={remove} disabled={busy} className="px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10">{t("propertyRooms.delete")}</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">{t("propertyRooms.cancel")}</button>
            <button onClick={save} disabled={busy} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">{busy ? t("propertyRooms.saving") : t("propertyRooms.save")}</button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkRoomsDialog({ type, property, existing, onClose, onSaved }: {
  type: TypeFull | null; property: Property; existing: Room[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [count, setCount] = useState(1);
  const [start, setStart] = useState("1");
  const [floor, setFloor] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!type) return;
    const nums = existing.map((r) => parseInt(r.number, 10)).filter((n) => Number.isFinite(n));
    setStart(String((nums.length ? Math.max(...nums) : 0) + 1));
    setCount(1);
  }, [type, existing]);

  const s = parseInt(start, 10);
  const numbers = Number.isFinite(s) ? Array.from({ length: Math.max(0, Math.min(count, 50)) }, (_, i) => String(s + i)) : [];
  const clash = numbers.filter((n) => existing.some((r) => r.number === n));

  const save = async () => {
    if (!type || numbers.length === 0) return toast.error(t("propertyRooms.err.invalid_count"));
    if (clash.length) return toast.error(t("propertyRooms.err.number_taken"));
    const f = floor.trim() === "" ? null : Number(floor);
    setBusy(true);
    // Atomic + validated server-side (permission, property, type, duplicates, existing numbers).
    const { error } = await supabase.rpc("create_rooms_bulk", {
      _property_id: property.id, _room_type_id: type.id, _numbers: numbers, _floor: f,
    } as never);
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(t("propertyRooms.roomsCreated", { n: numbers.length }));
    onSaved(); onClose();
  };

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("propertyRooms.bulkTitle", { name: type?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("propertyRooms.bulkDesc", { n: type?.capacity ?? 0 })}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">{t("propertyRooms.count")}</label>
            <input className={input} type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("propertyRooms.startNumber")}</label>
            <input className={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("propertyRooms.floor")}</label>
            <input className={input} type="number" min={0} max={50} value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("propertyRooms.willCreate")} {numbers.length ? numbers.map((n) => `#${n}`).join(", ") : "—"}
          {clash.length > 0 && <span className="text-destructive"> · {t("propertyRooms.alreadyTaken", { list: clash.join(", ") })}</span>}
        </p>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">{t("propertyRooms.cancel")}</button>
          <button onClick={save} disabled={busy || clash.length > 0} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">{busy ? t("propertyRooms.saving") : t("propertyRooms.create")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
