import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Users, Layers } from "lucide-react";
import { toast } from "sonner";
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
const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

export function PropertyRoomsView({ propertyId }: { propertyId: string }) {
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
    const fail = [pr, rt, rm].find((r) => r.error);
    if (fail?.error || !pr.data) {
      setError(fail?.error ? `${fail.error.code ?? ""} ${fail.error.message}` : "Pension nicht gefunden");
      setLoading(false);
      return;
    }
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
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  const assignType = async (roomId: string, typeId: string) => {
    const { error } = await supabase.from("rooms").update({ room_type_id: typeId || null }).eq("id", roomId);
    if (error) return toast.error(error.message);
    toast.success("Zimmertyp zugewiesen");
    load();
  };
  const removeRoom = async (id: string) => {
    if (!confirm("Dieses Zimmer wirklich löschen?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Zimmer gelöscht");
    load();
  };

  const title = property ? `${property.name} – Zimmer` : "Zimmer";
  if (loading && !property) return <AppShell title={title}><div className="text-sm text-muted-foreground">Lädt…</div></AppShell>;
  if (error || !property) {
    return (
      <AppShell title={title}>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-1">
          <p className="font-medium text-destructive">Zimmerdaten konnten nicht geladen werden.</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button onClick={load} className={`${btn} mt-2`}>Erneut versuchen</button>
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
        {showAssign && (
          <select defaultValue="" onChange={(e) => e.target.value && assignType(r.id, e.target.value)} className="px-2 py-1 rounded-md border border-input bg-card text-xs">
            <option value="">Typ zuweisen…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.capacity} P.)</option>)}
          </select>
        )}
        <div className="flex gap-1">
          <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-accent" title="Bearbeiten"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => removeRoom(r.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  };

  return (
    <AppShell
      title={title}
      subtitle={`${types.length} Zimmertypen · ${rooms.length} Zimmer · heute frei: ${totalFree}`}
      actions={
        <button onClick={() => setTypeDlg("new")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> Zimmertyp anlegen
        </button>
      }
    >
      <nav className="text-xs text-muted-foreground mb-4">
        <Link to="/properties" className="hover:underline">Pensionen</Link> / {property.name} / Zimmer
      </nav>

      {types.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-5 text-sm mb-4 space-y-2">
          <p className="font-medium">Für diese Pension wurde noch kein Zimmertyp angelegt.</p>
          <p className="text-muted-foreground text-xs">
            Ein Zimmertyp (z. B. Einzelzimmer, Doppelzimmer) ist die Kategorie mit Preis, die an Booking.com / Airbnb gemeldet wird – kein echtes Zimmer.
            Danach fügen Sie unter dem Typ die echten Zimmer hinzu (z. B. 5 × Einzelzimmer).
          </p>
          <button onClick={() => setTypeDlg("new")} className={btn}><Plus className="w-3 h-3" /> Zimmertyp anlegen</button>
        </div>
      )}

      <div className="space-y-4">
        {types.map((t) => {
          const list = rooms.filter((r) => r.room_type_id === t.id);
          const a = avail[t.id];
          return (
            <div key={t.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/40">
                <Layers className="w-4 h-4 text-primary" />
                <div className="flex-1 min-w-[160px]">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{t.capacity} Pers.</span>
                    <span>· {t.price != null ? `${t.price.toFixed(2)} € / Nacht` : "kein Preis"}</span>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold text-sm">{list.length} Zimmer</div>
                  <div className="text-muted-foreground">heute frei: <span className="font-semibold text-foreground">{a?.free ?? list.length}</span></div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setBulkFor(t)} className={btn}><Plus className="w-3 h-3" /> Zimmer</button>
                  <button onClick={() => setTypeDlg(t)} className="p-1.5 rounded hover:bg-accent" title="Typ bearbeiten"><Pencil className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {list.length === 0
                ? <div className="px-4 py-3 text-xs text-muted-foreground">Noch keine Zimmer dieses Typs. Mit „+ Zimmer“ hinzufügen.</div>
                : list.map((r) => roomRow(r, false))}
            </div>
          );
        })}

        {untyped.length > 0 && (
          <div className="rounded-xl border border-dashed border-border overflow-hidden">
            <div className="px-4 py-3 bg-muted/20">
              <div className="font-semibold text-sm">Ohne Zimmertyp ({untyped.length})</div>
              <div className="text-xs text-muted-foreground">
                {types.length ? "Weisen Sie jedem Zimmer einen Typ zu, damit Preis und Verfügbarkeit stimmen." : "Legen Sie zuerst einen Zimmertyp an, dann können Sie diese Zimmer zuweisen."}
              </div>
            </div>
            {untyped.map((r) => roomRow(r, types.length > 0))}
          </div>
        )}
      </div>

      <TypeDialog
        value={typeDlg}
        property={property}
        onClose={() => setTypeDlg(null)}
        onSaved={load}
        roomCount={typeDlg && typeDlg !== "new" ? rooms.filter((r) => r.room_type_id === typeDlg.id).length : 0}
      />
      <BulkRoomsDialog type={bulkFor} property={property} existing={rooms} onClose={() => setBulkFor(null)} onSaved={load} />
      <RoomDialog
        open={!!editing}
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
    if (!name.trim()) return toast.error("Name angeben");
    if (price === "" || !(p >= 0)) return toast.error("Gültigen Preis angeben");
    if (!(capacity >= 1 && capacity <= 20)) return toast.error("Personenzahl 1–20");
    setBusy(true);
    const code = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "TYPE";
    let typeId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("room_types").update({ name: name.trim(), capacity, base_occupancy: capacity }).eq("id", editing.id);
      if (error) { setBusy(false); return toast.error(error.message); }
    } else {
      const { data, error } = await supabase.from("room_types").insert({
        organization_id: property.organization_id, property_id: property.id, name: name.trim(), code,
        capacity, base_occupancy: capacity, active: true,
      }).select("id").single();
      if (error || !data) { setBusy(false); return toast.error(error?.message ?? "Fehler"); }
      typeId = data.id;
    }
    const { error: e2 } = editing?.planId
      ? await supabase.from("rate_plans").update({ base_price: p }).eq("id", editing.planId)
      : await supabase.from("rate_plans").insert({
          organization_id: property.organization_id, room_type_id: typeId!, name: "Standard",
          code: `${editing?.code ?? code}-STD`, currency: "EUR", base_price: p, min_stay: 1, active: true,
        });
    setBusy(false);
    if (e2) return toast.error(e2.message);
    toast.success(editing ? "Zimmertyp gespeichert" : "Zimmertyp angelegt");
    onSaved(); onClose();
  };

  const remove = async () => {
    if (!editing) return;
    if (roomCount > 0) return toast.error("Zuerst die Zimmer dieses Typs einem anderen Typ zuweisen.");
    if (!confirm(`Zimmertyp „${editing.name}“ löschen?`)) return;
    setBusy(true);
    await supabase.from("rate_plans").delete().eq("room_type_id", editing.id);
    const { error } = await supabase.from("room_types").delete().eq("id", editing.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Zimmertyp gelöscht");
    onSaved(); onClose();
  };

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Zimmertyp bearbeiten" : "Zimmertyp anlegen"}</DialogTitle>
          <DialogDescription>Kategorie für Preis und Buchungsportale – kein echtes Zimmer. Echte Zimmer fügen Sie danach mit „+ Zimmer“ hinzu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <input className={input} placeholder="z. B. Einzelzimmer" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {[["Einzelzimmer", 1], ["Doppelzimmer", 2], ["Dreibettzimmer", 3], ["Vierbettzimmer", 4]].map(([n, c]) => (
                <button key={n} type="button" onClick={() => { setName(String(n)); setCapacity(Number(c)); }} className="px-2 py-0.5 rounded-full border border-border text-[11px] hover:bg-accent">{n}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Max. Personen</label>
              <input className={input} type="number" min={1} max={20} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Preis € / Nacht</label>
              <input className={input} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? <button onClick={remove} disabled={busy} className="px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10">Löschen</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">Abbrechen</button>
            <button onClick={save} disabled={busy} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">{busy ? "Speichert…" : "Speichern"}</button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkRoomsDialog({ type, property, existing, onClose, onSaved }: {
  type: TypeFull | null; property: Property; existing: Room[]; onClose: () => void; onSaved: () => void;
}) {
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
    if (!type || numbers.length === 0) return toast.error("Anzahl und Startnummer angeben");
    if (clash.length) return toast.error(`Nummer bereits vergeben: ${clash.join(", ")}`);
    const f = floor.trim() === "" ? null : Number(floor);
    setBusy(true);
    const { error } = await supabase.from("rooms").insert(numbers.map((n) => ({
      organization_id: property.organization_id, property_id: property.id, number: n,
      capacity: type.capacity, floor: f, status: "available" as const, room_type_id: type.id,
    })));
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${numbers.length} Zimmer angelegt`);
    onSaved(); onClose();
  };

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zimmer hinzufügen · {type?.name}</DialogTitle>
          <DialogDescription>Echte Zimmer dieses Typs ({type?.capacity} Pers.). Mehrere auf einmal möglich.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Anzahl</label>
            <input className={input} type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ab Nummer</label>
            <input className={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Etage (0 = EG)</label>
            <input className={input} type="number" min={0} max={50} value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Wird angelegt: {numbers.length ? numbers.map((n) => `#${n}`).join(", ") : "—"}
          {clash.length > 0 && <span className="text-destructive"> · bereits vorhanden: {clash.join(", ")}</span>}
        </p>
        <DialogFooter>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">Abbrechen</button>
          <button onClick={save} disabled={busy || clash.length > 0} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50">{busy ? "Speichert…" : "Anlegen"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
