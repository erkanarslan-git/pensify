import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Channel = "booking" | "airbnb" | "check24" | "website" | "direct";
const CHANNELS: { value: Channel; label: string }[] = [
  { value: "direct", label: "Direkt / Telefon" },
  { value: "booking", label: "Booking" },
  { value: "airbnb", label: "Airbnb" },
  { value: "check24", label: "Check24" },
  { value: "website", label: "Web" },
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

export function NewReservationDialog({
  open,
  onOpenChange,
  initialDate,
  initialPropertyId,
  initialRoomNumber,
  onCreated,
}: Props) {
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
      let pid = initialPropertyId && p.some((x) => x.id === initialPropertyId)
        ? initialPropertyId
        : (p[0]?.id ?? "");
      const matching = r.filter((x) => x.property_id === pid);
      const initRoom =
        (initialRoomNumber && matching.find((x) => x.number === initialRoomNumber)) ||
        matching[0];
      setLines([
        {
          uid: uid(),
          propertyId: pid,
          roomId: initRoom?.id ?? "",
          checkIn: startDate,
          checkOut: addDays(startDate, 1),
          guestsCount: 1,
          revenue: 0,
        },
      ]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-fill price from the room's rate plan whenever room or dates change.
  // Manual edits to the price stay until room/dates change again.
  const quotedKeys = useRef<Record<string, string>>({});
  const priceKey = lines.map((l) => `${l.uid}|${l.roomId}|${l.checkIn}|${l.checkOut}`).join(",");
  useEffect(() => {
    lines.forEach(async (l) => {
      const key = `${l.roomId}|${l.checkIn}|${l.checkOut}`;
      if (!l.roomId || l.checkOut <= l.checkIn || quotedKeys.current[l.uid] === key) return;
      quotedKeys.current[l.uid] = key;
      const { data } = await supabase.rpc("quote_room_price", {
        _room_id: l.roomId, _check_in: l.checkIn, _check_out: l.checkOut,
      });
      if (data != null && quotedKeys.current[l.uid] === key) {
        setLines((ls) => ls.map((x) => (x.uid === l.uid ? { ...x, revenue: Number(data) } : x)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  const updateLine = (id: string, patch: Partial<RoomLine>) => {
    setLines((ls) =>
      ls.map((l) => {
        if (l.uid !== id) return l;
        const next = { ...l, ...patch };
        if (patch.propertyId && patch.propertyId !== l.propertyId) {
          const first = rooms.find((r) => r.property_id === patch.propertyId);
          next.roomId = first?.id ?? "";
        }
        return next;
      }),
    );
  };

  const addLine = () => {
    const last = lines[lines.length - 1];
    const pid = last?.propertyId ?? properties[0]?.id ?? "";
    const firstRoom = rooms.find((r) => r.property_id === pid);
    setLines((ls) => [
      ...ls,
      {
        uid: uid(),
        propertyId: pid,
        roomId: firstRoom?.id ?? "",
        checkIn: last?.checkIn ?? today,
        checkOut: last?.checkOut ?? addDays(today, 1),
        guestsCount: 1,
        revenue: 0,
      },
    ]);
  };

  const removeLine = (id: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.uid !== id) : ls));

  const submit = async () => {
    if (!guestName.trim()) return toast.error("Gastname erforderlich");
    if (lines.length === 0) return toast.error("Mindestens ein Zimmer hinzufügen");
    for (const l of lines) {
      if (!l.propertyId || !l.roomId)
        return toast.error("Pension und Zimmer in jeder Zeile wählen");
      if (l.checkOut <= l.checkIn)
        return toast.error("Check-out muss nach Check-in liegen");
    }

    setSaving(true);
    // One database transaction: booking + all rooms succeed together or not at all.
    const { error } = await supabase.rpc("create_booking_with_reservations", {
      _booking: {
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim(),
        guest_phone: guestPhone.trim(),
        channel,
        notes: notes.trim(),
      },
      _lines: lines.map((l) => ({
        property_id: l.propertyId,
        room_id: l.roomId,
        guests_count: l.guestsCount,
        check_in: l.checkIn,
        check_out: l.checkOut,
        revenue: l.revenue,
      })),
    });
    setSaving(false);

    if (error) {
      toast.error("Buchung konnte nicht gespeichert werden", { description: error.message });
      return;
    }
    toast.success(lines.length > 1 ? `${lines.length} Zimmer gespeichert` : "Buchung erstellt");
    onOpenChange(false);
    onCreated?.();
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-5 border-b border-border">
          <DialogTitle>Neue Buchung</DialogTitle>
          <DialogDescription>Ein Gast, ein oder mehrere Zimmer.</DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-6 space-y-6">
          {/* Guest information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="guestName" className="text-xs text-muted-foreground uppercase tracking-wider">
                Gastname *
              </Label>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={100}
                placeholder="Vor- und Nachname"
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guestEmail" className="text-xs text-muted-foreground uppercase tracking-wider">
                E-Mail
              </Label>
              <Input
                id="guestEmail"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                maxLength={255}
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guestPhone" className="text-xs text-muted-foreground uppercase tracking-wider">
                Telefon
              </Label>
              <Input
                id="guestPhone"
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                maxLength={32}
                className="bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel" className="text-xs text-muted-foreground uppercase tracking-wider">
                Kanal
              </Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                <SelectTrigger id="channel" className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-xs text-muted-foreground uppercase tracking-wider">
                Notiz
              </Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                className="bg-card"
              />
            </div>
          </div>

          {/* Room lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Zimmer ({lines.length})
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-3.5 h-3.5" />
                Zimmer hinzufügen
              </Button>
            </div>

            <div className="space-y-3">
              {lines.map((l) => {
                const propRooms = rooms.filter((r) => r.property_id === l.propertyId);
                return (
                  <div
                    key={l.uid}
                    className="rounded-xl border border-border bg-card p-4 space-y-4"
                  >
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-3 space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase">
                          Pension
                        </Label>
                        <Select
                          value={l.propertyId}
                          onValueChange={(v) => updateLine(l.uid, { propertyId: v })}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {properties.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase">
                          Zimmer
                        </Label>
                        <Select
                          value={l.roomId}
                          onValueChange={(v) => updateLine(l.uid, { roomId: v })}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {propRooms.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                #{r.number}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3 space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase">
                          Check-In
                        </Label>
                        <Input
                          type="date"
                          value={l.checkIn}
                          onChange={(e) => updateLine(l.uid, { checkIn: e.target.value })}
                          className="bg-background"
                        />
                      </div>
                      <div className="col-span-3 space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase">
                          Check-Out
                        </Label>
                        <Input
                          type="date"
                          value={l.checkOut}
                          onChange={(e) => updateLine(l.uid, { checkOut: e.target.value })}
                          className="bg-background"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center pb-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeLine(l.uid)}
                          disabled={lines.length === 1}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-3 pt-4 border-t border-border">
                      <div className="col-span-3 space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground uppercase">
                          Gäste
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={l.guestsCount}
                          onChange={(e) =>
                            updateLine(l.uid, { guestsCount: Math.max(1, +e.target.value || 1) })
                          }
                          className="bg-background"
                        />
                      </div>
                      <div className="col-span-9 space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                          Betrag (€)
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.revenue}
                          onChange={(e) =>
                            updateLine(l.uid, { revenue: Math.max(0, +e.target.value || 0) })
                          }
                          className="bg-background"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-5 border-t border-border bg-muted/30 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving
              ? "Speichern…"
              : `Speichern${lines.length > 1 ? ` (${lines.length} Zimmer)` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
