import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmAction } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { berlinToday } from "@/lib/room-active-copy";
import { roomActiveCopy } from "@/lib/room-active-copy";

/** Close (deactivate) or reopen a physical room after an explicit, informative confirmation. */
export function useRoomActiveToggle(onDone: () => void) {
  const { i18n } = useTranslation();
  const c = roomActiveCopy(i18n.language);
  return async (room: { id: string; number: string }, nextActive: boolean) => {
    let description = nextActive ? c.openText : c.closeText;
    if (!nextActive) {
      const { count } = await supabase.from("reservations").select("id", { count: "exact", head: true })
        .eq("room_id", room.id).is("deleted_at", null).gte("check_out", berlinToday())
        .not("status", "in", "(cancelled,no_show,checked_out)");
      if (count) description += `\n\n${c.upcoming(count)}`;
    }
    const ok = await confirmAction({ title: (nextActive ? c.openTitle : c.closeTitle)(room.number), description, confirmLabel: nextActive ? c.open : c.close, destructive: !nextActive });
    if (!ok) return;
    const { error } = await supabase.from("rooms").update({ active: nextActive }).eq("id", room.id);
    if (error) { toast.error(c.failed); return; }
    toast.success(nextActive ? c.opened : c.closed);
    onDone();
  };
}

export function RoomActiveSection({ room, onDone }: { room: { id: string; number: string }; onDone: () => void }) {
  const { i18n } = useTranslation();
  const c = roomActiveCopy(i18n.language);
  const toggle = useRoomActiveToggle(onDone);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground"><span className="block text-sm font-medium text-foreground">{c.sectionTitle}</span>{c.sectionHint}</div>
      <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => void toggle(room, false)}>{c.close}</Button>
    </div>
  );
}

export { Button };
