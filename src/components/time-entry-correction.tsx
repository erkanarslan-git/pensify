import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clockErrorKey } from "@/i18n/clock";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";

export type CorrectableEntry = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
};

/** Convert a UTC instant to a Berlin wall-clock value for <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return parts.replace(" ", "T");
}

/** Interpret a Berlin wall-clock input value as a UTC instant. */
function fromLocalInput(v: string): string {
  const guess = new Date(`${v}:00Z`);
  const shown = new Date(toLocalInput(guess.toISOString()) + ":00Z");
  return new Date(guess.getTime() - (shown.getTime() - guess.getTime())).toISOString();
}

export function TimeEntryCorrectionDialog({
  entry, endNow, onClose,
}: { entry: CorrectableEntry | null; endNow?: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [brk, setBrk] = useState("0");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!entry) return;
    setStart(toLocalInput(entry.clock_in_at));
    const isZero = entry.clock_out_at === entry.clock_in_at;
    setEnd(endNow ? toLocalInput(new Date().toISOString()) : entry.clock_out_at && !isZero ? toLocalInput(entry.clock_out_at) : "");
    setBrk(String(entry.break_minutes ?? 0));
    setReason("");
  }, [entry, endNow]);

  const history = useQuery({
    queryKey: ["time-entry-corrections", entry?.id],
    enabled: !!entry,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entry_corrections")
        .select("id, old_clock_in_at, old_clock_out_at, new_clock_in_at, new_clock_out_at, reason, changed_by, changed_at")
        .eq("time_entry_id", entry!.id)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!entry) return;
      const { error } = await supabase.rpc("correct_time_entry", {
        _entry_id: entry.id,
        _clock_in_at: fromLocalInput(start),
        _clock_out_at: (end ? fromLocalInput(end) : null) as unknown as string,
        _break_minutes: Number(brk) || 0,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("clock.saved"));
      qc.invalidateQueries({ queryKey: ["time-entries"] });
      onClose();
    },
    onError: (e) => toast.error(t(clockErrorKey(e))),
  });

  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("de-DE", { timeZone: BUSINESS_TIME_ZONE }) : "—");

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("clock.correctTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">{t("clock.start")}</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label className="text-xs">{t("clock.end")}</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">{t("clock.breakMin")}</Label><Input type="number" min={0} value={brk} onChange={(e) => setBrk(e.target.value)} /></div>
          <div>
            <Label className="text-xs">{endNow ? t("clock.endPrompt") : t("clock.reason")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">{t("clock.history")}</div>
            {(history.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("clock.noHistory")}</p>
            ) : (
              <ul className="space-y-1 text-xs max-h-32 overflow-auto">
                {history.data!.map((h) => (
                  <li key={h.id} className="border-b border-border pb-1">
                    <div>{fmt(h.changed_at)} · {h.reason ?? "—"}</div>
                    <div className="text-muted-foreground">{fmt(h.old_clock_in_at)} – {fmt(h.old_clock_out_at)} → {fmt(h.new_clock_in_at)} – {fmt(h.new_clock_out_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("clock.cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || reason.trim().length < 3 || !start}>{t("clock.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
