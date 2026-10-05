import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sourceColor, sourceLabel } from "@/lib/guest-color";
import { formatDateDE } from "@/lib/date-de";

/** Admin-only recycle bin for soft-deleted reservations. */
export function ReservationTrash({ onChanged }: { onChanged: () => void }) {
  const { data = [], refetch, isLoading } = useQuery({
    queryKey: ["reservations-trash"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reservations")
        .select("id,guest_name,channel,check_in,check_out,deleted_at,deleted_by,delete_reason,room:rooms(number),property:properties(name)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.deleted_by).filter(Boolean)));
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
        (profs ?? []).forEach((p: any) => names.set(p.id, p.full_name ?? "—"));
      }
      return rows.map((r) => ({ ...r, deleter: names.get(r.deleted_by) ?? "Unbekannt" }));
    },
  });

  const act = async (fn: "restore_reservation" | "purge_reservation", id: string) => {
    if (fn === "purge_reservation" && !confirm("Endgültig löschen? Das kann nicht rückgängig gemacht werden.")) return;
    const { error } = await (supabase as any).rpc(fn, { _id: id });
    if (error) {
      toast.error(error.message.includes("overlap") ? "Wiederherstellen nicht möglich: Zimmer ist in diesem Zeitraum belegt." : "Aktion fehlgeschlagen.");
      return;
    }
    toast.success(fn === "restore_reservation" ? "Buchung wiederhergestellt" : "Endgültig gelöscht");
    refetch();
    onChanged();
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Lädt…</div>;
  if (!data.length) return <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Papierkorb ist leer.</div>;

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
      {data.map((r: any) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ background: sourceColor(r.channel) }} />
          <div className="flex-1 min-w-[180px]">
            <div className="font-medium">{r.guest_name}</div>
            <div className="text-xs text-muted-foreground">
              {r.property?.name} · #{r.room?.number ?? "—"} · {sourceLabel(r.channel)} · {formatDateDE(r.check_in)} → {formatDateDE(r.check_out)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground min-w-[200px]">
            Gelöscht von <span className="font-medium text-foreground">{r.deleter}</span> am {new Date(r.deleted_at).toLocaleString("de-DE")}
            {r.delete_reason && <div>Grund: {r.delete_reason}</div>}
          </div>
          <button onClick={() => act("restore_reservation", r.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-input text-xs hover:bg-accent">
            <RotateCcw className="w-3 h-3" /> Wiederherstellen
          </button>
          <button onClick={() => act("purge_reservation", r.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-destructive/40 text-destructive text-xs hover:bg-destructive/10">
            <Trash2 className="w-3 h-3" /> Endgültig löschen
          </button>
        </div>
      ))}
    </div>
  );
}
