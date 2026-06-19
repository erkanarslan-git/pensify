import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Channel = "booking" | "airbnb" | "check24" | "web" | "direct";
const CHANNELS: { value: Channel; label: string }[] = [
  { value: "direct", label: "Direkt / Telefon" },
  { value: "booking", label: "Booking" },
  { value: "airbnb", label: "Airbnb" },
  { value: "check24", label: "Check24" },
  { value: "web", label: "Web" },
];

interface Property { id: string; name: string }
interface Room { id: string; number: string; property_id: string }

interface RoomLine {
  uid: string;
  propertyId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guestsCount: number;
  revenue: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDate?: string;
  initialPropertyId?: string;
  initialRoomNumber?: string;
  onCreated?: () => void;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
const uid = () => Math.random().toString(36).slice(2, 9);

export function NewReservationDialog({ open, onOpenChange, initialDate, initialPropertyId, initialRoomNumber, onCreated }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [channel, setChannel] = useState<Channel>("direct");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RoomLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: props }, { data: rms }] = await Promise.all([
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("rooms").select("id,number,property_id").order("number"),
      ]);
      const p = (props ?? []) as Property[];
      const r = (rms ?? []) as Room[];
      setProperties(p);
      setRooms(r);

      const startDate = initialDate ?? today;
      let pid = initialPropertyId && p.some((x) => x.id === initialPropertyId) ? initialPropertyId : (p[0]?.id ?? "");
      const matching = r.filter((x) => x.property_id === pid);
      const initRoom = (initialRoomNumber && matching.find((x) => x.number === initialRoomNumber)) || matching[0];
      setLines([{
        uid: uid(),
        propertyId: pid,
        roomId: initRoom?.id ?? "",
        checkIn: startDate,
        checkOut: addDays(startDate, 1),
        guestsCount: 1,
        revenue: 0,
      }]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateLine = (id: string, patch: Partial<RoomLine>) => {
    setLines((ls) => ls.map((l) => {
      if (l.uid !== id) return l;
      const next = { ...l, ...patch };
      if (patch.propertyId && patch.propertyId !== l.propertyId) {
        const first = rooms.find((r) => r.property_id === patch.propertyId);
        next.roomId = first?.id ?? "";
      }
      return next;
    }));
  };

  const addLine = () => {
    const last = lines[lines.length - 1];
    const pid = last?.propertyId ?? properties[0]?.id ?? "";
    const firstRoom = rooms.find((r) => r.property_id === pid);
    setLines((ls) => [...ls, {
      uid: uid(),
      propertyId: pid,
      roomId: firstRoom?.id ?? "",
      checkIn: last?.checkIn ?? today,
      checkOut: last?.checkOut ?? addDays(today, 1),
      guestsCount: 1,
      revenue: 0,
    }]);
  };

  const removeLine = (id: string) => setLines((ls) => ls.length > 1 ? ls.filter((l) => l.uid !== id) : ls);

  const submit = async () => {
    if (!guestName.trim()) return toast.error("Misafir adı zorunlu");
    if (lines.length === 0) return toast.error("En az bir oda ekleyin");
    for (const l of lines) {
      if (!l.propertyId || !l.roomId) return toast.error("Her satırda lokasyon ve oda seçin");
      if (l.checkOut <= l.checkIn) return toast.error("Çıkış tarihi girişten sonra olmalı");
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    // 1) Create parent booking if multiple rooms (or always — helpful for history)
    let bookingId: string | null = null;
    if (lines.length >= 1) {
      const { data: bk, error: bkErr } = await supabase.from("bookings").insert({
        primary_guest_name: guestName.trim(),
        primary_guest_email: guestEmail.trim() || null,
        primary_guest_phone: guestPhone.trim() || null,
        channel,
        notes: notes.trim() || null,
        created_by: userId,
      }).select("id").single();
      if (bkErr) {
        setSaving(false);
        toast.error("Booking oluşturulamadı", { description: bkErr.message });
        return;
      }
      bookingId = bk?.id ?? null;
    }

    // 2) Insert reservations
    const rows = lines.map((l) => ({
      booking_id: bookingId,
      property_id: l.propertyId,
      room_id: l.roomId,
      guest_name: guestName.trim(),
      guest_email: guestEmail.trim() || null,
      guest_phone: guestPhone.trim() || null,
      guests_count: l.guestsCount,
      check_in: l.checkIn,
      check_out: l.checkOut,
      channel,
      revenue: l.revenue,
      notes: notes.trim() || null,
      created_by: userId,
    }));
    const { error } = await supabase.from("reservations").insert(rows);
    setSaving(false);

    if (error) {
      toast.error("Rezervasyon eklenemedi", { description: error.message });
      return;
    }
    toast.success(lines.length > 1 ? `${lines.length} oda kaydedildi` : "Rezervasyon oluşturuldu");
    onOpenChange(false);
    onCreated?.();
    setGuestName(""); setGuestEmail(""); setGuestPhone(""); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni rezervasyon</DialogTitle>
          <DialogDescription>Tek misafir, bir veya birden fazla oda.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 grid gap-1">
              <span className="text-xs text-muted-foreground">Misafir adı *</span>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={100}
                className="px-3 py-2 rounded-md border border-input bg-card" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">E-posta</span>
              <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} maxLength={255}
                className="px-3 py-2 rounded-md border border-input bg-card" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Telefon</span>
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} maxLength={32}
                className="px-3 py-2 rounded-md border border-input bg-card" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Kanal</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}
                className="px-3 py-2 rounded-md border border-input bg-card">
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Not</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000}
                className="px-3 py-2 rounded-md border border-input bg-card" />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Odalar ({lines.length})
              </div>
              <button type="button" onClick={addLine}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-xs hover:bg-accent">
                <Plus className="w-3.5 h-3.5" /> Oda ekle
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((l) => {
                const propRooms = rooms.filter((r) => r.property_id === l.propertyId);
                return (
                  <div key={l.uid} className="rounded-md border border-border p-3 grid grid-cols-12 gap-2 items-end">
                    <label className="col-span-4 grid gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase">Lokasyon</span>
                      <select value={l.propertyId} onChange={(e) => updateLine(l.uid, { propertyId: e.target.value })}
                        className="px-2 py-1.5 rounded-md border border-input bg-card text-sm">
                        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    <label className="col-span-2 grid gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase">Oda</span>
                      <select value={l.roomId} onChange={(e) => updateLine(l.uid, { roomId: e.target.value })}
                        className="px-2 py-1.5 rounded-md border border-input bg-card text-sm">
                        {propRooms.map((r) => <option key={r.id} value={r.id}>#{r.number}</option>)}
                      </select>
                    </label>
                    <label className="col-span-2 grid gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase">Giriş</span>
                      <input type="date" value={l.checkIn} onChange={(e) => updateLine(l.uid, { checkIn: e.target.value })}
                        className="px-2 py-1.5 rounded-md border border-input bg-card text-sm" />
                    </label>
                    <label className="col-span-2 grid gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase">Çıkış</span>
                      <input type="date" value={l.checkOut} onChange={(e) => updateLine(l.uid, { checkOut: e.target.value })}
                        className="px-2 py-1.5 rounded-md border border-input bg-card text-sm" />
                    </label>
                    <label className="col-span-1 grid gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase">Kişi</span>
                      <input type="number" min={1} value={l.guestsCount}
                        onChange={(e) => updateLine(l.uid, { guestsCount: Math.max(1, +e.target.value || 1) })}
                        className="px-2 py-1.5 rounded-md border border-input bg-card text-sm" />
                    </label>
                    <div className="col-span-1 flex justify-end">
                      <button type="button" onClick={() => removeLine(l.uid)} disabled={lines.length === 1}
                        className="p-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-30">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <label className="col-span-12 grid gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase">Tutar (€)</span>
                      <input type="number" min={0} step="0.01" value={l.revenue}
                        onChange={(e) => updateLine(l.uid, { revenue: Math.max(0, +e.target.value || 0) })}
                        className="px-2 py-1.5 rounded-md border border-input bg-card text-sm" />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} disabled={saving}
            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">İptal</button>
          <button onClick={submit} disabled={saving}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Kaydediliyor…" : `Kaydet${lines.length > 1 ? ` (${lines.length} oda)` : ""}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
