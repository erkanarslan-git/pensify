import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fromLocalInput } from "@/components/time-entry-correction";

const COPY = {
  tr: { open: "Elle mesai ekle", title: "Elle mesai ekle", day: "Gün", property: "Pansiyon", start: "Başlangıç", end: "Bitiş", brk: "Mola (dk)", ot: "Bunun ekstra çalışma (dk)", otHint: "İsteğe bağlı. Normal mesaiden düşülür ve ekstra çalışma olarak kaydedilir.", reason: "Sebep (zorunlu)", save: "Kaydet", cancel: "Vazgeç", ok: "Mesai eklendi", errors: { overlap: "Bu saatlerde zaten bir kayıt var.", invalid_range: "Saatler geçersiz (bitiş başlangıçtan sonra ve şimdiden önce olmalı, en fazla 24 saat).", invalid_break: "Mola süresi geçersiz.", invalid_minutes: "Ekstra çalışma, net çalışmadan fazla olamaz.", reason_required: "Lütfen bir sebep yazın.", overtime_rate_required: "Ekstra çalışma için önce bu kişinin saat ücretini girin.", forbidden: "Bu kişi için mesai ekleme yetkiniz yok.", generic: "Kaydedilemedi." } },
  de: { open: "Arbeitszeit nachtragen", title: "Arbeitszeit nachtragen", day: "Tag", property: "Standort", start: "Beginn", end: "Ende", brk: "Pause (Min.)", ot: "Davon Überstunden (Min.)", otHint: "Optional. Wird von der regulären Zeit abgezogen und als Überstunden erfasst.", reason: "Grund (Pflicht)", save: "Speichern", cancel: "Abbrechen", ok: "Arbeitszeit nachgetragen", errors: { overlap: "In diesem Zeitraum gibt es bereits einen Eintrag.", invalid_range: "Ungültige Zeiten (Ende nach Beginn, nicht in der Zukunft, max. 24 Std.).", invalid_break: "Ungültige Pause.", invalid_minutes: "Überstunden dürfen die Nettozeit nicht übersteigen.", reason_required: "Bitte einen Grund angeben.", overtime_rate_required: "Für Überstunden zuerst den Stundensatz hinterlegen.", forbidden: "Keine Berechtigung für diese Person.", generic: "Speichern fehlgeschlagen." } },
  en: { open: "Add time manually", title: "Add time manually", day: "Day", property: "Location", start: "Start", end: "End", brk: "Break (min)", ot: "Of which overtime (min)", otHint: "Optional. Deducted from regular time and recorded as overtime.", reason: "Reason (required)", save: "Save", cancel: "Cancel", ok: "Time added", errors: { overlap: "There is already an entry in this time range.", invalid_range: "Invalid times (end after start, not in the future, max 24h).", invalid_break: "Invalid break.", invalid_minutes: "Overtime cannot exceed net time.", reason_required: "Please enter a reason.", overtime_rate_required: "Set this person's hourly rate before adding overtime.", forbidden: "You are not allowed to add time for this person.", generic: "Could not save." } },
};

export function ManualTimeEntryButton({ userId }: { userId: string }) {
  const { i18n } = useTranslation();
  const c = COPY[(i18n.language?.slice(0, 2) as keyof typeof COPY)] ?? COPY.de;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [prop, setProp] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:00");
  const [brk, setBrk] = useState("30");
  const [ot, setOt] = useState("0");
  const [reason, setReason] = useState("");
  const props = useQuery({ queryKey: ["manual-time-properties"], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.from("properties").select("id,name").order("name");
    if (error) throw error;
    return data ?? [];
  } });
  const save = useMutation({
    mutationFn: async () => {
      const inAt = fromLocalInput(`${day}T${start}`);
      let outAt = fromLocalInput(`${day}T${end}`);
      if (outAt <= inAt) outAt = new Date(Date.parse(outAt) + 86400000).toISOString(); // overnight shift
      const { error } = await supabase.rpc("add_manual_time_entry", { _user_id: userId, _property_id: prop, _clock_in_at: inAt, _clock_out_at: outAt, _break_minutes: Number(brk) || 0, _overtime_minutes: Number(ot) || 0, _reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(c.ok); setOpen(false); setReason(""); setOt("0");
      await Promise.all([qc.invalidateQueries({ queryKey: ["employee-attendance"] }), qc.invalidateQueries({ queryKey: ["personnel-overtime"] })]);
    },
    onError: (e: Error) => { const key = Object.keys(c.errors).find((k) => e.message.includes(k)) as keyof typeof c.errors | undefined; toast.error(c.errors[key ?? "generic"]); },
  });
  return <>
    <Button variant="outline" size="sm" onClick={() => { setDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date())); setOpen(true); }}>{c.open}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{c.title}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1"><Label>{c.day}</Label><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
          <div className="grid gap-1"><Label>{c.property}</Label>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={prop} onChange={(e) => setProp(e.target.value)}>
              <option value="">—</option>{(props.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><Label>{c.start}</Label><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="grid gap-1"><Label>{c.end}</Label><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div className="grid gap-1"><Label>{c.brk}</Label><Input type="number" min={0} value={brk} onChange={(e) => setBrk(e.target.value)} /></div>
            <div className="grid gap-1"><Label>{c.ot}</Label><Input type="number" min={0} value={ot} onChange={(e) => setOt(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">{c.otHint}</p>
          <div className="grid gap-1"><Label>{c.reason}</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{c.cancel}</Button>
          <Button disabled={!day || !prop || reason.trim().length < 3 || save.isPending} onClick={() => save.mutate()}>{c.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
