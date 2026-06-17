import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Channel = "booking" | "airbnb" | "check24" | "woocommerce" | "phone" | "direct" | "walkin";
const CHANNELS: Channel[] = ["direct", "booking", "airbnb", "check24", "woocommerce", "phone", "walkin"];

interface Property { id: string; name: string }
interface Room { id: string; number: string; property_id: string }

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

export function NewReservationDialog({ open, onOpenChange, initialDate, initialPropertyId, initialRoomNumber, onCreated }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [checkIn, setCheckIn] = useState(initialDate ?? today);
  const [checkOut, setCheckOut] = useState(addDays(initialDate ?? today, 1));
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestsCount, setGuestsCount] = useState(1);
  const [channel, setChannel] = useState<Channel>("direct");
  const [revenue, setRevenue] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCheckIn(initialDate ?? today);
    setCheckOut(addDays(initialDate ?? today, 1));
    (async () => {
      const [{ data: props }, { data: rms }] = await Promise.all([
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("rooms").select("id,number,property_id").order("number"),
      ]);
      const p = (props ?? []) as Property[];
      const r = (rms ?? []) as Room[];
      setProperties(p);
      setRooms(r);

      // pick property: try matching initialPropertyId, else first
      let pid = "";
      if (initialPropertyId && p.some((x) => x.id === initialPropertyId)) pid = initialPropertyId;
      else pid = p[0]?.id ?? "";
      setPropertyId(pid);

      const matchingRooms = r.filter((x) => x.property_id === pid);
      const byNumber = initialRoomNumber ? matchingRooms.find((x) => x.number === initialRoomNumber) : undefined;
      setRoomId(byNumber?.id ?? matchingRooms[0]?.id ?? "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const matching = rooms.filter((x) => x.property_id === propertyId);
    if (!matching.some((m) => m.id === roomId)) {
      setRoomId(matching[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, rooms]);

  const propertyRooms = rooms.filter((r) => r.property_id === propertyId);

  const submit = async () => {
    if (!propertyId || !roomId) return toast.error("Lokasyon ve oda seç");
    if (!guestName.trim()) return toast.error("Misafir adı zorunlu");
    if (checkOut <= checkIn) return toast.error("Çıkış tarihi girişten sonra olmalı");

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("reservations").insert({
      property_id: propertyId,
      room_id: roomId,
      guest_name: guestName.trim(),
      guest_email: guestEmail.trim() || null,
      guest_phone: guestPhone.trim() || null,
      guests_count: guestsCount,
      check_in: checkIn,
      check_out: checkOut,
      channel,
      revenue,
      notes: notes.trim() || null,
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);

    if (error) {
      toast.error("Rezervasyon eklenemedi", { description: error.message });
      return;
    }
    toast.success("Rezervasyon oluşturuldu");
    onOpenChange(false);
    onCreated?.();
    // reset form
    setGuestName(""); setGuestEmail(""); setGuestPhone(""); setNotes(""); setRevenue(0); setGuestsCount(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni rezervasyon</DialogTitle>
          <DialogDescription>Boş güne hızlı rezervasyon ekle.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 grid gap-1">
            <span className="text-xs text-muted-foreground">Misafir adı *</span>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={100}
              className="px-3 py-2 rounded-md border border-input bg-card" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Lokasyon *</span>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
              className="px-3 py-2 rounded-md border border-input bg-card">
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Oda *</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}
              className="px-3 py-2 rounded-md border border-input bg-card">
              {propertyRooms.map((r) => <option key={r.id} value={r.id}>#{r.number}</option>)}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Giriş *</span>
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
              className="px-3 py-2 rounded-md border border-input bg-card" />
          </label>

          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Çıkış *</span>
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
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
            <span className="text-xs text-muted-foreground">Misafir sayısı</span>
            <input type="number" min={1} value={guestsCount} onChange={(e) => setGuestsCount(Math.max(1, +e.target.value || 1))}
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

          <label className="grid gap-1 col-span-2">
            <span className="text-xs text-muted-foreground">Tutar (€)</span>
            <input type="number" min={0} step="0.01" value={revenue}
              onChange={(e) => setRevenue(Math.max(0, +e.target.value || 0))}
              className="px-3 py-2 rounded-md border border-input bg-card" />
          </label>

          <label className="grid gap-1 col-span-2">
            <span className="text-xs text-muted-foreground">Notlar</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3}
              className="px-3 py-2 rounded-md border border-input bg-card resize-none" />
          </label>
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} disabled={saving}
            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">İptal</button>
          <button onClick={submit} disabled={saving}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
