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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { roomTypeVisual } from "@/lib/room-type-visuals";
import {
  RoomDialog, statusMeta, floorLabel,
  type Room, type RoomStatus, type Cleaner, type Property, type RoomType,
} from "@/routes/_authenticated/rooms";

interface TypeFull {
  id: string; name: string; code: string; capacity: number; base_occupancy: number; description: string | null;
  active: boolean; property_id: string | null; planId: string | null; price: number | null; demoPrice: boolean;
}
interface Avail { room_type_id: string; total: number; booked: number; free: number }

const input = "w-full px-3 py-2 rounded-md border border-input bg-card text-sm";
const btn = "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-xs hover:bg-accent";
const primaryBtn = "inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50";
const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Map DB/RPC errors to safe, translated messages. Raw details go to the console only. */
export function friendlyError(t: TFunction, err: { code?: string; message?: string } | null | undefined): string {
  if (err) console.error("[rooms]", err);
  const msg = err?.message ?? "";
  const known = ["invalid_name", "invalid_capacity", "invalid_price", "capacity_below_rooms", "invalid_count", "invalid_number",
    "invalid_floor", "duplicate_number", "number_taken", "forbidden", "invalid_code", "code_taken", "invalid_base_occupancy",
    "invalid_range", "no_rate_plan", "invalid_batch", "invalid_description"];
  const hit = known.find((k) => msg.includes(k));
  if (hit) return t(`propertyRooms.err.${hit}`);
  if (msg.includes("not_found") || err?.code === "P0002") return t("propertyRooms.err.not_found");
  if (err?.code === "42501") return t("propertyRooms.err.forbidden");
  if (err?.code === "23503") return t("propertyRooms.err.in_use");
  if (err?.code === "23505") return t("propertyRooms.err.number_taken");
  return t("propertyRooms.err.generic");
}

export function PropertyRoomsView({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canManage = perms.can("manage_rooms");
  const [property, setProperty] = useState<Property | null>(null);
  const [types, setTypes] = useState<TypeFull[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [avail, setAvail] = useState<Record<string, Avail>>({});
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typeDlg, setTypeDlg] = useState<TypeFull | "new" | null>(null);
  const [bulkFor, setBulkFor] = useState<TypeFull | null>(null);
  const [editing, setEditing] = useState<Room | null>(null);
  const [newRoom, setNewRoom] = useState(false);
  const [deleting, setDeleting] = useState<TypeFull | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pr, rt, rp, rm, cl, live, av] = await Promise.all([
      supabase.from("properties").select("id,name,city_id,organization_id").eq("id", propertyId).maybeSingle(),
      supabase.from("room_types").select("id,name,code,capacity,base_occupancy,description,active,property_id").eq("property_id", propertyId).order("capacity").order("name"),
      supabase.from("rate_plans").select("id,room_type_id,name,base_price,created_at").eq("property_id", propertyId).eq("active", true).order("created_at"),
      supabase.from("rooms").select("id,property_id,number,capacity,status,floor,notes,default_cleaner_id,room_type_id").eq("property_id", propertyId).order("number"),
      supabase.from("cleaners").select("id,full_name,active").order("full_name"),
      supabase.from("room_operational_status").select("room_id,status"),
      supabase.rpc("room_type_availability", { _property: propertyId, _date: todayStr() }),
    ]);
    const fail = [pr, rt, rm].find((r) => r.error);
    if (fail?.error || !pr.data) {
      if (fail?.error) console.error("[property-rooms] load", fail.error);
      setError(fail?.error ? t("propertyRooms.loadErrorHint") : t("propertyRooms.notFound"));
      setLoading(false);
      return;
    }
    const soft = [rp, cl, live, av].filter((r) => r.error);
    soft.forEach((r) => console.error("[property-rooms] load (secondary)", r.error));
    setPartial(soft.length > 0);
    setError(null);
    setProperty(pr.data as Property);
    setTypes((rt.data ?? []).map((x) => {
      const p = (rp.data ?? []).find((y) => y.room_type_id === x.id);
      return { ...x, planId: p?.id ?? null, price: p ? Number(p.base_price) : null, demoPrice: p?.name === "Standard (Demo)" } as TypeFull;
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
    const ty = types.find((x) => x.id === typeId);
    const { error } = await supabase.from("rooms").update({ room_type_id: typeId || null, ...(ty ? { capacity: ty.capacity } : {}) }).eq("id", roomId);
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
  const toggleActive = async (ty: TypeFull) => {
    const { error } = await supabase.rpc("set_room_type_active", { _room_type_id: ty.id, _active: !ty.active } as never);
    if (error) return toast.error(friendlyError(t, error));
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

  const untyped = rooms.filter((r) => !r.room_type_id || !types.some((x) => x.id === r.room_type_id));
  const totalFree = Object.values(avail).reduce((s, a) => s + a.free, 0);
  const activeTypes = types.filter((x) => x.active);

  const roomRow = (r: Room, showAssign: boolean, ty?: TypeFull) => {
    const meta = statusMeta[r.status];
    const visual = roomTypeVisual(ty?.code);
    const typeName = ty?.name ?? t("propertyRooms.noType");
    return (
      <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border px-3 py-2.5 first:border-t-0 sm:flex sm:flex-wrap sm:gap-x-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex min-w-0 items-center gap-2 sm:w-52">
              <span className={`h-7 w-1 shrink-0 rounded-full ${visual.marker}`} />
              <div className="min-w-0">
                <div className="font-semibold text-sm break-words">#{r.number}</div>
                <div className="text-[11px] text-muted-foreground truncate">{typeName}</div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>{t("propertyRooms.roomIdentity", { number: r.number, type: typeName })}</TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground w-10">{floorLabel(r.floor)}</span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-[120px]">
          🧹 {cleaners.find((c) => c.id === r.default_cleaner_id)?.full_name ?? "—"}
        </span>
        {showAssign && canManage && activeTypes.length > 0 && (
          <select defaultValue="" onChange={(e) => e.target.value && assignType(r.id, e.target.value)} className="px-2 py-1 rounded-md border border-input bg-card text-xs">
            <option value="">{t("propertyRooms.assignType")}</option>
            {activeTypes.map((ty) => <option key={ty.id} value={ty.id}>{ty.name} ({t("propertyRooms.persons", { n: ty.capacity })})</option>)}
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

  const statusCount = (list: Room[], s: RoomStatus[]) => list.filter((r) => s.includes(r.status)).length;

  return (
    <AppShell title={title} subtitle={t("propertyRooms.subtitle", { types: types.length, rooms: rooms.length, free: totalFree })}>
      <nav className="text-xs text-muted-foreground mb-4">
        <Link to="/properties" className="hover:underline">{t("propertyRooms.breadcrumb")}</Link> / {property.name}
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

      <TooltipProvider delayDuration={200}>
      <Tabs defaultValue={types.length ? "overview" : "types"}>
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="overview">{t("propertyRooms.tab.overview")}</TabsTrigger>
          <TabsTrigger value="types">{t("propertyRooms.tab.types")}</TabsTrigger>
          <TabsTrigger value="rooms">{t("propertyRooms.tab.rooms")}</TabsTrigger>
          <TabsTrigger value="prices">{t("propertyRooms.tab.prices")}</TabsTrigger>
          <TabsTrigger value="channels">{t("propertyRooms.tab.channels")}</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>{["type", "total", "occupied", "free", "cleaning", "maintenance"].map((k) => <th key={k} className="text-left px-3 py-2 font-medium">{t(`propertyRooms.ov.${k}`)}</th>)}</tr>
              </thead>
              <tbody>
                {[...types.map((ty) => ({ id: ty.id, name: ty.name, code: ty.code, inactive: !ty.active, list: rooms.filter((r) => r.room_type_id === ty.id) })),
                  ...(untyped.length ? [{ id: "none", name: t("propertyRooms.noType"), code: "", inactive: false, list: untyped }] : [])].map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${roomTypeVisual(row.code).marker}`} />{row.name}</span>{row.inactive && <span className="ml-1 text-xs text-muted-foreground">({t("propertyRooms.inactive")})</span>}</td>
                    <td className="px-3 py-2">{row.list.length}</td>
                    <td className="px-3 py-2">{statusCount(row.list, ["occupied", "checkout_today"])}</td>
                    <td className="px-3 py-2">{row.id !== "none" && avail[row.id] ? avail[row.id].free : statusCount(row.list, ["available", "cleaned"])}</td>
                    <td className="px-3 py-2">{statusCount(row.list, ["cleaning_required", "cleaning_in_progress"])}</td>
                    <td className="px-3 py-2">{statusCount(row.list, ["maintenance"])}</td>
                  </tr>
                ))}
                {types.length === 0 && untyped.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-xs text-muted-foreground">{t("propertyRooms.noTypesHint")}</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Room types */}
        <TabsContent value="types" className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground max-w-2xl">{t("propertyRooms.noTypesHint")}</p>
            {canManage && <button onClick={() => setTypeDlg("new")} className={primaryBtn}><Plus className="w-4 h-4" /> {t("propertyRooms.addType")}</button>}
          </div>
          {types.length === 0 && <div className="rounded-lg border border-dashed border-border p-5 text-sm">{t("propertyRooms.noTypes")}</div>}
          {types.map((ty) => {
            const list = rooms.filter((r) => r.room_type_id === ty.id);
            return (
              <div key={ty.id} className={`rounded-xl border ${roomTypeVisual(ty.code).border} ${roomTypeVisual(ty.code).surface} px-4 py-3 flex flex-wrap items-center gap-3 ${ty.active ? "" : "opacity-60"}`}>
                <Layers className={`w-4 h-4 ${roomTypeVisual(ty.code).text}`} />
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold">{ty.name} <Tooltip><TooltipTrigger asChild><span tabIndex={0} className={`ml-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${roomTypeVisual(ty.code).border} ${roomTypeVisual(ty.code).text}`}>{ty.code}</span></TooltipTrigger><TooltipContent>{t("propertyRooms.codeHint", { code: ty.code, name: ty.name })}</TooltipContent></Tooltip></div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{t("propertyRooms.persons", { n: ty.capacity })}</span>
                    <span>· {ty.price != null ? t("propertyRooms.perNight", { price: ty.price.toFixed(2) }) : t("propertyRooms.noPrice")}</span>
                    <span>· {t("propertyRooms.roomCount", { n: list.length })}</span>
                    <span>· {t("propertyRooms.freeToday")} {avail[ty.id]?.free ?? list.length}</span>
                  </div>
                  {ty.description && <div className="text-xs text-muted-foreground mt-0.5">{ty.description}</div>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch checked={ty.active} onCheckedChange={() => toggleActive(ty)} aria-label={t("propertyRooms.active")} />
                      {ty.active ? t("propertyRooms.active") : t("propertyRooms.inactive")}
                    </label>
                    <button onClick={() => setTypeDlg(ty)} className="p-1.5 rounded hover:bg-accent" title={t("propertyRooms.editType")} aria-label={t("propertyRooms.editType")}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleting(ty)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title={t("propertyRooms.delete")} aria-label={t("propertyRooms.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            );
          })}
        </TabsContent>

        {/* Physical rooms */}
        <TabsContent value="rooms" className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <button onClick={() => setNewRoom(true)} className={primaryBtn}><Plus className="w-4 h-4" /> {t("propertyRooms.newRoom")}</button>
            </div>
          )}
          {types.map((ty) => {
            const list = rooms.filter((r) => r.room_type_id === ty.id);
            return (
              <div key={ty.id} className={`rounded-xl border ${roomTypeVisual(ty.code).border} bg-card overflow-hidden`}>
                <div className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${roomTypeVisual(ty.code).surface}`}>
                  <span className={`h-7 w-1 shrink-0 rounded-full ${roomTypeVisual(ty.code).marker}`} />
                  <div className="flex-1 font-semibold text-sm">{ty.name} <span className="text-xs text-muted-foreground font-normal">· {ty.code} · {t("propertyRooms.roomCount", { n: list.length })}</span></div>
                  {canManage && ty.active && <button onClick={() => setBulkFor(ty)} className={btn}><Plus className="w-3 h-3" /> {t("propertyRooms.addRooms")}</button>}
                </div>
                {list.length === 0
                  ? <div className="px-4 py-3 text-xs text-muted-foreground">{t("propertyRooms.noRoomsOfType")}</div>
                  : list.map((r) => roomRow(r, false, ty))}
              </div>
            );
          })}
          {untyped.length > 0 && (
            <div className="rounded-xl border border-dashed border-border overflow-hidden">
              <div className="px-4 py-3 bg-muted/20">
                <div className="font-semibold text-sm">{t("propertyRooms.untyped", { n: untyped.length })}</div>
                <div className="text-xs text-muted-foreground">{types.length ? t("propertyRooms.untypedHint") : t("propertyRooms.untypedHintNoTypes")}</div>
              </div>
              {untyped.map((r) => roomRow(r, true))}
            </div>
          )}
        </TabsContent>

        {/* Prices */}
        <TabsContent value="prices" className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("propertyRooms.pricesHint")}</p>
          {types.length === 0 && <div className="rounded-lg border border-dashed border-border p-5 text-sm">{t("propertyRooms.noTypes")}</div>}
          {types.map((ty) => <PriceCard key={ty.id} type={ty} canManage={canManage} />)}
        </TabsContent>

        <TabsContent value="channels">
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">{t("propertyRooms.channelsSoon")}</div>
        </TabsContent>
      </Tabs>
      </TooltipProvider>

      <TypeDialog value={canManage ? typeDlg : null} property={property} onClose={() => setTypeDlg(null)} onSaved={load} />
      <BulkRoomsDialog type={canManage ? bulkFor : null} property={property} existing={rooms} onClose={() => setBulkFor(null)} onSaved={load} />
      <DeleteTypeDialog type={canManage ? deleting : null} types={types} roomCount={deleting ? rooms.filter((r) => r.room_type_id === deleting.id).length : 0}
        onClose={() => setDeleting(null)} onDone={load} />
      <RoomDialog
        open={canManage && (!!editing || newRoom)}
        room={editing}
        propertyId={property.id}
        properties={[property]}
        cleaners={cleaners}
        roomTypes={(editing ? types : activeTypes) as unknown as RoomType[]}
        onClose={() => { setEditing(null); setNewRoom(false); }}
        onSaved={load}
      />
    </AppShell>
  );
}

function TypeDialog({ value, property, onClose, onSaved }: {
  value: TypeFull | "new" | null; property: Property; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const editing = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [capacity, setCapacity] = useState(2);
  const [baseOcc, setBaseOcc] = useState(2);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return;
    setName(editing?.name ?? "");
    setCode(editing?.code ?? "");
    setCodeTouched(!!editing);
    setCapacity(editing?.capacity ?? 2);
    setBaseOcc(editing?.base_occupancy ?? 2);
    setDescription(editing?.description ?? "");
    setPrice(editing?.price != null ? String(editing.price) : "");
  }, [value]);

  const autoCode = (n: string) => n.trim().toUpperCase().replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS")
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

  const save = async () => {
    const p = Number(price);
    if (!name.trim()) return toast.error(t("propertyRooms.err.invalid_name"));
    if (price === "" || !(p >= 0)) return toast.error(t("propertyRooms.err.invalid_price"));
    setBusy(true);
    const { error } = await supabase.rpc("save_room_type_full", {
      _property_id: property.id, _room_type_id: editing?.id ?? null, _name: name.trim(), _code: code.trim(),
      _capacity: capacity, _base_occupancy: baseOcc, _description: description, _price: p,
    } as never);
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(editing ? t("propertyRooms.typeSaved") : t("propertyRooms.typeCreated"));
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
            <input className={input} placeholder={t("propertyRooms.namePlaceholder")} value={name} maxLength={80}
              onChange={(e) => { setName(e.target.value); if (!codeTouched) setCode(autoCode(e.target.value)); }} />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {([["Einzelzimmer", 1, "EZ"], ["Doppelzimmer", 2, "DZ"], ["Dreibettzimmer", 3, "3BZ"], ["Vierbettzimmer", 4, "4BZ"]] as const).map(([n, c, k]) => (
                <button key={n} type="button" onClick={() => { setName(n); setCapacity(c); setBaseOcc(c); if (!codeTouched) setCode(k); }} className="px-2 py-0.5 rounded-full border border-border text-[11px] hover:bg-accent">{n}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">{t("propertyRooms.code")}</label>
              <input className={input} value={code} maxLength={20} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true); }} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("propertyRooms.maxPersons")}</label>
              <input className={input} type="number" min={1} max={20} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("propertyRooms.baseOccupancy")}</label>
              <input className={input} type="number" min={1} max={capacity} value={baseOcc} onChange={(e) => setBaseOcc(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("propertyRooms.pricePerNight")}</label>
            <input className={input} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("propertyRooms.description")}</label>
            <textarea className={input} rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">{t("propertyRooms.cancel")}</button>
          <button onClick={save} disabled={busy} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">{busy ? t("propertyRooms.saving") : t("propertyRooms.save")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Deleting a type with rooms is blocked: offer deactivate / move rooms / cancel. */
function DeleteTypeDialog({ type, types, roomCount, onClose, onDone }: {
  type: TypeFull | null; types: TypeFull[]; roomCount: number; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTarget(""); }, [type]);
  if (!type) return null;
  const others = types.filter((x) => x.id !== type.id && x.active && x.capacity >= 1);

  const run = async (fn: () => Promise<{ error: { code?: string; message?: string } | null }>, okMsg: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(okMsg);
    onDone(); onClose();
  };
  const deactivate = () => run(async () => await supabase.rpc("set_room_type_active", { _room_type_id: type.id, _active: false } as never), t("propertyRooms.typeDeactivated"));
  const move = () => run(async () => await supabase.rpc("move_rooms_to_type", { _from_type: type.id, _to_type: target } as never), t("propertyRooms.roomsMoved"));
  const remove = () => run(async () => {
    // Plans with history (occupancy prices, channel mappings, reservations) make the delete fail → user sees "in use".
    const r1 = await supabase.from("rate_plans").delete().eq("room_type_id", type.id);
    if (r1.error) return r1;
    return await supabase.from("room_types").delete().eq("id", type.id);
  }, t("propertyRooms.typeDeleted"));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("propertyRooms.confirmDeleteType", { name: type.name })}</DialogTitle>
          <DialogDescription>{roomCount > 0 ? t("propertyRooms.deleteHasRooms", { n: roomCount }) : t("propertyRooms.deleteNoRooms")}</DialogDescription>
        </DialogHeader>
        {roomCount > 0 ? (
          <div className="space-y-3">
            <button disabled={busy} onClick={deactivate} className={`${btn} w-full justify-center py-2`}>{t("propertyRooms.deactivate")}</button>
            <div className="flex gap-2">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="flex-1 px-2 py-1.5 rounded-md border border-input bg-card text-sm">
                <option value="">{t("propertyRooms.moveTo")}</option>
                {others.map((x) => <option key={x.id} value={x.id}>{x.name} ({t("propertyRooms.persons", { n: x.capacity })})</option>)}
              </select>
              <button disabled={busy || !target} onClick={move} className={btn}>{t("propertyRooms.move")}</button>
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">{t("propertyRooms.cancel")}</button>
          {roomCount === 0 && <button disabled={busy} onClick={remove} className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm">{t("propertyRooms.delete")}</button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceCard({ type, canManage }: { type: TypeFull; canManage: boolean }) {
  const { t } = useTranslation();
  const today = todayStr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const guests = Array.from({ length: type.capacity }, (_, i) => i + 1);

  const save = async () => {
    const payload: Record<string, number> = {};
    for (const g of guests) {
      const v = prices[g];
      if (v === undefined || v === "") continue;
      const n = Number(v);
      if (!(n >= 0)) return toast.error(t("propertyRooms.err.invalid_price"));
      payload[String(g)] = n;
    }
    if (!Object.keys(payload).length) return toast.error(t("propertyRooms.err.invalid_price"));
    setBusy(true);
    const { error } = await supabase.rpc("save_occupancy_prices", { _room_type_id: type.id, _from: from, _to: to, _prices: payload } as never);
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(t("propertyRooms.pricesSaved"));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="font-semibold text-sm">{type.name} <span className="text-xs text-muted-foreground font-normal">· {type.price != null ? t("propertyRooms.perNight", { price: type.price.toFixed(2) }) : t("propertyRooms.noPrice")}</span>{type.demoPrice && <span className="ml-2 text-[10px] font-medium text-warning-foreground">{t("propertyRooms.demoPrice")}</span>}</div>
      {type.price == null ? <p className="text-xs text-muted-foreground">{t("propertyRooms.err.no_rate_plan")}</p> : (
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="space-y-1"><span className="block text-muted-foreground">{t("propertyRooms.from")}</span>
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} disabled={!canManage} /></label>
          <label className="space-y-1"><span className="block text-muted-foreground">{t("propertyRooms.to")}</span>
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} disabled={!canManage} /></label>
          {guests.map((g) => (
            <label key={g} className="space-y-1 w-24"><span className="block text-muted-foreground">{t("propertyRooms.guestPrice", { n: g })}</span>
              <input type="number" min={0} step="0.01" className={input} placeholder={type.price?.toFixed(2)} value={prices[g] ?? ""} disabled={!canManage}
                onChange={(e) => setPrices((s) => ({ ...s, [g]: e.target.value }))} /></label>
          ))}
          {canManage && <button disabled={busy} onClick={save} className={primaryBtn}>{busy ? t("propertyRooms.saving") : t("propertyRooms.save")}</button>}
        </div>
      )}
    </div>
  );
}

function BulkRoomsDialog({ type, property, existing, onClose, onSaved }: {
  type: TypeFull | null; property: Property; existing: Room[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"range" | "list">("range");
  const [count, setCount] = useState(1);
  const [start, setStart] = useState("1");
  const [listText, setListText] = useState("");
  const [floor, setFloor] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!type) return;
    const nums = existing.map((r) => parseInt(r.number, 10)).filter((n) => Number.isFinite(n));
    setStart(String((nums.length ? Math.max(...nums) : 0) + 1));
    setCount(1); setListText(""); setMode("range");
  }, [type, existing]);

  useEffect(() => {
    if (mode === "range") {
      const s = parseInt(start, 10);
      setPreview(Number.isFinite(s) ? Array.from({ length: Math.max(0, Math.min(count, 50)) }, (_, i) => String(s + i)) : []);
    } else {
      setPreview(listText.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 50));
    }
  }, [mode, start, count, listText]);

  const clash = preview.filter((n, i) => existing.some((r) => r.number === n.trim()) || preview.indexOf(n) !== i);

  const save = async () => {
    const nums = preview.map((n) => n.trim());
    if (!type || nums.length === 0 || nums.some((n) => !n)) return toast.error(t("propertyRooms.err.invalid_count"));
    if (clash.length) return toast.error(t("propertyRooms.err.number_taken"));
    const f = floor.trim() === "" ? null : Number(floor);
    setBusy(true);
    const { error } = await supabase.rpc("create_rooms_bulk", {
      _property_id: property.id, _room_type_id: type.id, _numbers: nums, _floor: f,
    } as never);
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    toast.success(t("propertyRooms.roomsCreated", { n: nums.length }));
    onSaved(); onClose();
  };

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("propertyRooms.bulkTitle", { name: type?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("propertyRooms.bulkDesc", { n: type?.capacity ?? 0 })}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 text-xs">
          {(["range", "list"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 rounded-full border ${mode === m ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{t(`propertyRooms.mode_${m}`)}</button>
          ))}
        </div>
        {mode === "range" ? (
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-xs text-muted-foreground">{t("propertyRooms.count")}</label>
              <input className={input} type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} /></div>
            <div><label className="text-xs text-muted-foreground">{t("propertyRooms.startNumber")}</label>
              <input className={input} value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">{t("propertyRooms.floor")}</label>
              <input className={input} type="number" min={-5} max={100} value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div><label className="text-xs text-muted-foreground">{t("propertyRooms.numberList")}</label>
              <input className={input} placeholder="101, 102, 105" value={listText} onChange={(e) => setListText(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">{t("propertyRooms.floor")}</label>
              <input className={input} type="number" min={-5} max={100} value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground mb-1">{t("propertyRooms.willCreate")}</p>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {preview.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            {preview.map((n, i) => (
              <input key={i} value={n} maxLength={20} aria-label={t("propertyRooms.roomNumber")}
                onChange={(e) => setPreview((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                className={`w-16 px-1.5 py-1 rounded border text-xs ${clash.includes(n) ? "border-destructive text-destructive" : "border-input"} bg-card`} />
            ))}
          </div>
          {clash.length > 0 && <p className="text-xs text-destructive mt-1">{t("propertyRooms.alreadyTaken", { list: [...new Set(clash)].join(", ") })}</p>}
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">{t("propertyRooms.cancel")}</button>
          <button onClick={save} disabled={busy || clash.length > 0 || preview.length === 0} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">{busy ? t("propertyRooms.saving") : t("propertyRooms.create")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
