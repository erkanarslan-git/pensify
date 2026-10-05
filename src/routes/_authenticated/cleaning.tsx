import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useMemo, useState } from "react";
import { Camera, Check, Play, AlertTriangle, MessageCircle, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/cleaning")({
  head: () => ({ meta: [{ title: "Reinigung — Pensify" }] }),
  component: CleaningPage,
});

type CleaningStatus = "pending" | "accepted" | "in_progress" | "completed" | "problem";

const statusMeta: Record<CleaningStatus, { label: string; tone: "warning" | "info" | "success" | "destructive" | "muted" }> = {
  pending: { label: "Offen", tone: "warning" },
  accepted: { label: "Angenommen", tone: "info" },
  in_progress: { label: "Läuft", tone: "info" },
  completed: { label: "Fertig", tone: "success" },
  problem: { label: "Problem", tone: "destructive" },
};

type View = "open" | "problem" | "done" | "all";

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
  const [view, setView] = useState<View>("open");
  const [prop, setProp] = useState("all");

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["cleaning-page"],
    queryFn: async () => {
      const [ts, rm, pr, cl] = await Promise.all([
        supabase.from("cleaning_tasks")
          .select("id,room_id,property_id,cleaner_id,due_at,status,photos_count,notes")
          .order("due_at", { ascending: true }),
        supabase.from("rooms").select("id,number,floor"),
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("cleaners").select("id,full_name,active").order("full_name"),
      ]);
      const err = ts.error ?? rm.error ?? pr.error ?? cl.error;
      if (err) throw err;
      return {
        tasks: (ts.data ?? []) as Task[],
        rooms: (rm.data ?? []) as Room[],
        properties: (pr.data ?? []) as Property[],
        cleaners: (cl.data ?? []) as Cleaner[],
      };
    },
  });

  const tasks = data?.tasks ?? [];
  const rooms = useMemo(() => new Map((data?.rooms ?? []).map((r) => [r.id, r])), [data]);
  const properties = data?.properties ?? [];
  const cleaners = data?.cleaners ?? [];
  const cleanerName = (id: string | null) => (id ? cleaners.find((c) => c.id === id)?.full_name : undefined);

  const update = async (id: string, status: CleaningStatus) => {
    const { error } = await supabase.rpc("transition_cleaning_task", { _task_id: id, _to: status });
    if (error) { toast.error(error.message); return; }
    toast.success(`Aufgabe: ${statusMeta[status].label}`);
    refetch();
  };

  const reassign = async (taskId: string, cleanerId: string) => {
    const { error } = await supabase.from("cleaning_tasks").update({ cleaner_id: cleanerId || null }).eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    toast.success(cleanerId ? "Reinigungskraft zugewiesen" : "Zuweisung entfernt");
    refetch();
  };

  const isOpen = (s: CleaningStatus) => s === "pending" || s === "accepted" || s === "in_progress";
  const counts = {
    open: tasks.filter((x) => isOpen(x.status)).length,
    problem: tasks.filter((x) => x.status === "problem").length,
    done: tasks.filter((x) => x.status === "completed").length,
    unassigned: tasks.filter((x) => !x.cleaner_id && x.status !== "completed").length,
  };

  const filtered = tasks.filter((x) => {
    if (prop !== "all" && x.property_id !== prop) return false;
    if (view === "open") return isOpen(x.status);
    if (view === "problem") return x.status === "problem";
    if (view === "done") return x.status === "completed";
    return true;
  });

  const groups = properties
    .map((p) => ({ ...p, items: filtered.filter((x) => x.property_id === p.id) }))
    .filter((g) => g.items.length > 0);

  const views: { id: View; label: string; n: number }[] = [
    { id: "open", label: "Zu erledigen", n: counts.open },
    { id: "problem", label: "Probleme", n: counts.problem },
    { id: "done", label: "Erledigt", n: counts.done },
    { id: "all", label: "Alle", n: tasks.length },
  ];

  return (
    <AppShell
      title={t("pages.cleaning.title")}
      subtitle={`${counts.open} offen · ${counts.unassigned} ohne Reinigungskraft`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${view === v.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
          >
            {v.label} ({v.n})
          </button>
        ))}
        <select value={prop} onChange={(e) => setProp(e.target.value)} className="ml-auto px-3 py-2 rounded-md border border-input bg-card text-sm">
          <option value="all">Alle Pensionen</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          Reinigungsaufgaben konnten nicht geladen werden.{" "}
          <button onClick={() => refetch()} className="underline font-medium">Erneut versuchen</button>
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <Sparkles className="w-6 h-6 mx-auto mb-2 text-success" />
          {view === "open" ? "Alles sauber — keine offenen Aufgaben." : "Keine Aufgaben für diese Auswahl."}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const gOpen = g.items.filter((x) => isOpen(x.status)).length;
            const gProb = g.items.filter((x) => x.status === "problem").length;
            return (
              <details key={g.id} open className="group rounded-xl border border-border bg-card">
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" />
                    <span className="font-semibold truncate">{g.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {g.items.length} Aufgaben · {gOpen} offen{gProb > 0 ? ` · ${gProb} Problem` : ""}
                  </span>
                </summary>
                <div className="border-t border-border divide-y divide-border/60">
                  {g.items.map((task) => {
                    const room = rooms.get(task.room_id);
                    const meta = statusMeta[task.status];
                    const due = new Date(task.due_at);
                    const unassigned = !task.cleaner_id;
                    const name = cleanerName(task.cleaner_id);
                    return (
                      <div key={task.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
                        <div className="w-20 font-semibold">#{room?.number ?? "—"}</div>
                        <div className="w-28 text-muted-foreground tabular-nums">
                          {due.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="w-28"><Badge tone={meta.tone}>{meta.label}</Badge></div>
                        <div className="flex-1 min-w-[160px]">
                          {canAssign ? (
                            <select
                              value={task.cleaner_id ?? ""}
                              onChange={(e) => reassign(task.id, e.target.value)}
                              className={`text-xs px-2 py-1 rounded-md border bg-card ${unassigned ? "border-warning text-warning" : "border-input"}`}
                            >
                              <option value="">— nicht zugewiesen —</option>
                              {cleaners.filter((c) => c.active || c.id === task.cleaner_id).map((c) => (
                                <option key={c.id} value={c.id}>{c.full_name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={unassigned ? "text-warning italic" : ""}>{name ?? "nicht zugewiesen"}</span>
                          )}
                          {task.notes && <div className="text-xs text-muted-foreground italic mt-0.5">"{task.notes}"</div>}
                        </div>
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Camera className="w-3 h-3" />{task.photos_count}</span>
                        <div className="flex gap-1.5">
                        <div className="flex gap-1.5">
                          {task.status === "pending" && (
                            <ActionBtn onClick={() => update(task.id, "accepted")} icon={<Check className="w-3 h-3" />}>Annehmen</ActionBtn>
                          )}
                          {(task.status === "accepted" || task.status === "problem") && (
                            <ActionBtn onClick={() => update(task.id, "in_progress")} icon={<Play className="w-3 h-3" />}>Starten</ActionBtn>
                          )}
                          {task.status === "in_progress" && (
                            <ActionBtn onClick={() => update(task.id, "completed")} icon={<Check className="w-3 h-3" />}>Fertig</ActionBtn>
                          )}
                          
                          {/* Reversal Buttons */}
                          {task.status === "accepted" && (
                            <button onClick={() => update(task.id, "pending")} title={t("common.undo")} className="text-xs px-2 py-1.5 rounded-md border border-border hover:bg-accent">
                              <Undo2 className="w-3 h-3" />
                            </button>
                          )}
                          {task.status === "in_progress" && (
                            <button onClick={() => update(task.id, "accepted")} title={t("common.undo")} className="text-xs px-2 py-1.5 rounded-md border border-border hover:bg-accent">
                              <Undo2 className="w-3 h-3" />
                            </button>
                          )}
                          {task.status === "completed" && (
                            <button onClick={() => update(task.id, "in_progress")} title={t("common.undo")} className="text-xs px-2 py-1.5 rounded-md border border-border hover:bg-accent">
                              <Undo2 className="w-3 h-3" />
                            </button>
                          )}
                          {task.status === "problem" && (
                            <button onClick={() => update(task.id, "accepted")} title={t("common.undo")} className="text-xs px-2 py-1.5 rounded-md border border-border hover:bg-accent">
                              <Undo2 className="w-3 h-3" />
                            </button>
                          )}

                          {isOpen(task.status) && (
                            <button onClick={() => update(task.id, "problem")} title="Problem melden" className="text-xs px-2 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5">
                              <AlertTriangle className="w-3 h-3" />
                            </button>
                          )}

                          {canAssign && (
                            <button onClick={() => update(task.id, "pending")} title={t("common.reset")} className="text-xs px-2 py-1.5 rounded-md border border-warning/30 text-warning hover:bg-warning/5">
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function ActionBtn({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1">
      {icon} {children}
    </button>
  );
}
