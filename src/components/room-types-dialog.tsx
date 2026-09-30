import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";

interface TypeRow {
  id: string;
  name: string;
  code: string;
  capacity: number;
  planId: string | null;
  price: string;
}

const input = "w-full px-2 py-1.5 rounded-md border border-input bg-card text-sm";

interface PropertyOpt { id: string; name: string; organization_id: string }

export function RoomTypesDialog({
  open, properties, onClose, onSaved,
}: { open: boolean; properties: PropertyOpt[]; onClose: () => void; onSaved: () => void }) {
  const [propertyId, setPropertyId] = useState("");
  const organizationId = properties.find((p) => p.id === propertyId)?.organization_id ?? null;
  const [rows, setRows] = useState<TypeRow[]>([]);
  const [draft, setDraft] = useState({ name: "", capacity: 2, price: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !properties.some((p) => p.id === propertyId)) setPropertyId(properties[0]?.id ?? "");
  }, [open, properties, propertyId]);

  const load = async () => {
    if (!propertyId) { setRows([]); return; }
    const [{ data: types }, { data: plans }] = await Promise.all([
      supabase.from("room_types").select("id,name,code,capacity").eq("property_id", propertyId).order("name"),
      supabase.from("rate_plans").select("id,room_type_id,base_price,active,created_at").eq("property_id", propertyId).eq("active", true).order("created_at"),
    ]);
    setRows((types ?? []).map((t) => {
      const p = (plans ?? []).find((x) => x.room_type_id === t.id);
      return { ...t, planId: p?.id ?? null, price: p ? String(p.base_price) : "" };
    }));
  };
  useEffect(() => { if (open) load(); }, [open, propertyId]);

  const savePrice = async (r: TypeRow) => {
    const price = Number(r.price);
    if (!(price >= 0) || !organizationId) return toast.error("Ungültiger Preis");
    setBusy(true);
    const { error } = r.planId
      ? await supabase.from("rate_plans").update({ base_price: price }).eq("id", r.planId)
      : await supabase.from("rate_plans").insert({
          organization_id: organizationId, room_type_id: r.id, name: "Standard",
          code: `${r.code}-STD`, currency: "EUR", base_price: price, min_stay: 1, active: true,
        });
    const { error: e2 } = await supabase.from("room_types")
      .update({ name: r.name.trim(), capacity: r.capacity }).eq("id", r.id);
    setBusy(false);
    if (error || e2) return toast.error((error ?? e2)!.message);
    toast.success("Gespeichert");
    load(); onSaved();
  };

  const create = async () => {
    const price = Number(draft.price);
    if (!draft.name.trim() || !(price >= 0) || !organizationId) return toast.error("Name und Preis angeben");
    setBusy(true);
    const code = draft.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 20) || "TYPE";
    const { data: t, error } = await supabase.from("room_types").insert({
      organization_id: organizationId, property_id: propertyId, name: draft.name.trim(), code,
      capacity: draft.capacity, base_occupancy: draft.capacity, active: true,
    }).select("id").single();
    if (!error && t) {
      const { error: e2 } = await supabase.from("rate_plans").insert({
        organization_id: organizationId, room_type_id: t.id, name: "Standard",
        code: `${code}-STD`, currency: "EUR", base_price: price, min_stay: 1, active: true,
      });
      if (e2) toast.error(e2.message);
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft({ name: "", capacity: 2, price: "" });
    load(); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Zimmertypen & Preise</DialogTitle>
          <DialogDescription>Pro Haus: Zimmertypen und Preis pro Nacht. Neue Buchungen übernehmen ihn automatisch.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={input}>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="grid grid-cols-[1fr_70px_100px_36px] gap-2 text-[11px] text-muted-foreground uppercase">
            <span>Name</span><span>Pers.</span><span>€ / Nacht</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr_70px_100px_36px] gap-2">
              <input className={input} value={r.name} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <input className={input} type="number" min={1} value={r.capacity} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, capacity: Number(e.target.value) } : x))} />
              <input className={input} type="number" min={0} step="0.01" value={r.price} onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
              <button disabled={busy} onClick={() => savePrice(r)} title="Speichern" className="inline-flex items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-50">
                <Save className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_70px_100px_36px] gap-2 pt-2 border-t border-border">
            <input className={input} placeholder="z. B. Doppelzimmer" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input className={input} type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })} />
            <input className={input} type="number" min={0} step="0.01" placeholder="0.00" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            <button disabled={busy} onClick={create} title="Hinzufügen" className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
