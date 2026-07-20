import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { Camera, Check, Play, AlertTriangle, MessageCircle, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/cleaning")({
  head: () => ({ meta: [{ title: "Cleaning — Pensify" }] }),
  component: CleaningPage,
});

type CleaningStatus = "pending" | "accepted" | "in_progress" | "completed" | "problem";

const statusMeta: Record<CleaningStatus, { label: string; tone: "warning" | "info" | "success" | "destructive" | "muted" }> = {
  pending: { label: "Bekliyor", tone: "warning" },
  accepted: { label: "Kabul edildi", tone: "info" },
  in_progress: { label: "Devam ediyor", tone: "info" },
  completed: { label: "Tamamlandı", tone: "success" },
  problem: { label: "Sorun", tone: "destructive" },
};

interface Task {
  id: string;
  room_id: string;
  property_id: string;
  cleaner_id: string | null;
  due_at: string;
  status: CleaningStatus;
  photos_count: number;
  notes: string | null;
}
interface Room { id: string; number: string; floor: number | null }
interface Property { id: string; name: string }
interface Cleaner { id: string; full_name: string; active: boolean }

function CleaningPage() {
  const { t } = useTranslation();
  const perm = usePermissions();
  const canAssign = perm.can("assign_cleaning");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [filter, setFilter] = useState<CleaningStatus | "all">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: ts }, { data: rm }, { data: pr }, { data: cl }] = await Promise.all([
        supabase.from("cleaning_tasks")
          .select("id,room_id,property_id,cleaner_id,due_at,status,photos_count,notes")
          .order("due_at", { ascending: true }),
        supabase.from("rooms").select("id,number,floor"),
        supabase.from("properties").select("id,name"),
        supabase.from("cleaners").select("id,full_name,active").order("full_name"),
      ]);
      setTasks((ts ?? []) as Task[]);
      setRooms((rm ?? []) as Room[]);
      setProperties((pr ?? []) as Property[]);
      setCleaners((cl ?? []) as Cleaner[]);
    })();
  }, [refreshKey]);

  const getRoom = (id: string) => rooms.find((r) => r.id === id);
  const getProperty = (id: string) => properties.find((p) => p.id === id);
  const getCleaner = (id: string | null) => (id ? cleaners.find((c) => c.id === id) : undefined);

  const update = async (id: string, status: CleaningStatus) => {
    const { error } = await supabase.from("cleaning_tasks")
      .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Görev: ${statusMeta[status].label}`);
    setRefreshKey((k) => k + 1);
  };

  const reassign = async (taskId: string, cleanerId: string) => {
    const { error } = await supabase.from("cleaning_tasks")
      .update({ cleaner_id: cleanerId || null })
      .eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    toast.success(cleanerId ? "Temizlikçi atandı" : "Atama kaldırıldı");
    setRefreshKey((k) => k + 1);
  };

  const list = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((x) => x.status === filter)),
    [tasks, filter]
  );

  const unassignedCount = tasks.filter((x) => !x.cleaner_id).length;

  return (
    <AppShell
      title={t("pages.cleaning.title")}
      subtitle={
        unassignedCount > 0
          ? `${tasks.length} görev · ${unassignedCount} atanmamış`
          : `${tasks.length} görev`
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
        >
          Tümü ({tasks.length})
        </button>
        {(Object.keys(statusMeta) as CleaningStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
          >
            {statusMeta[s].label} ({tasks.filter((x) => x.status === s).length})
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((task) => {
          const room = getRoom(task.room_id);
          const prop = getProperty(task.property_id);
          const cleaner = getCleaner(task.cleaner_id);
          const meta = statusMeta[task.status];
          const due = new Date(task.due_at);
          const unassigned = !task.cleaner_id;
          return (
            <div key={task.id} className={`rounded-xl border bg-card p-5 shadow-soft ${unassigned ? "border-amber-400/60" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">{prop?.name}</div>
                  <div className="text-lg font-semibold tracking-tight">Zimmer #{room?.number}</div>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>

              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fällig</span>
                  <span className="font-medium">{due.toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground">Reinigungskraft</span>
                  {canAssign ? (
                    <select
                      value={task.cleaner_id ?? ""}
                      onChange={(e) => reassign(task.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-md border bg-card max-w-[60%] ${unassigned ? "border-amber-400 text-amber-700 dark:border-amber-500/60 dark:text-amber-300" : "border-input"}`}
                    >
                      <option value="">— atanmamış —</option>
                      {cleaners.filter((c) => c.active || c.id === task.cleaner_id).map((c) => (
                        <option key={c.id} value={c.id}>{c.full_name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`font-medium ${unassigned ? "text-amber-600 italic" : ""}`}>
                      {cleaner?.full_name ?? "atanmamış"}
                    </span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fotos</span>
                  <span className="font-medium inline-flex items-center gap-1"><Camera className="w-3 h-3" />{task.photos_count}</span>
                </div>
                {task.notes && (
                  <div className="text-xs text-muted-foreground italic pt-1">"{task.notes}"</div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <button onClick={() => update(task.id, "accepted")} className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> Akzeptieren
                </button>
                <button onClick={() => update(task.id, "in_progress")} className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1">
                  <Play className="w-3 h-3" /> Starten
                </button>
                <button onClick={() => update(task.id, "completed")} className="text-xs px-2.5 py-1.5 rounded-md bg-success text-success-foreground hover:opacity-90 inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> Fertig
                </button>
                <button onClick={() => update(task.id, "problem")} className="text-xs px-2.5 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Problem
                </button>
                {cleaner && (
                  <button
                    onClick={() => toast.info(`WhatsApp → ${cleaner.full_name}`)}
                    className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1 ml-auto"
                  >
                    <MessageCircle className="w-3 h-3" /> Benachrichtigen
                  </button>
                )}
                {!cleaner && canAssign && (
                  <span className="text-[11px] text-amber-600 inline-flex items-center gap-1 ml-auto">
                    <UserCog className="w-3 h-3" /> Reinigungskraft zuweisen
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <Section title="Keine Aufgaben"><div className="text-sm text-muted-foreground">Für diesen Filter gibt es keine Reinigungsaufgaben.</div></Section>
        )}
      </div>
    </AppShell>
  );
}
