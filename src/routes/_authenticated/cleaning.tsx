import { displayLocale } from "@/i18n/legacy-ui";
import { BUSINESS_TIME_ZONE, businessDate } from "@/lib/business-time";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useMemo, useState } from "react";
import { Camera, Check, Play, AlertTriangle, MessageCircle, ChevronDown, Sparkles, Undo2, RotateCcw, UserX } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshCleaningQueries } from "@/lib/cleaning-queries";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { ReportIssueDialog } from "@/components/room-issues";
import { canChangeCleaningAssignment, taskAssignmentOptions } from "@/lib/assignment";
import { cleaningNeedsReview, validCleaningReason, type InspectionState } from "@/lib/cleaning-inspection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/cleaning")({
  head: () => ({ meta: [{ title: "Reinigung — Pension Highway" }, { name: "description", content: "Reinigungsaufgaben und Zimmerbereitschaft verwalten." }, { property: "og:title", content: "Reinigung — Pension Highway" }, { property: "og:description", content: "Reinigungsaufgaben und Zimmerbereitschaft verwalten." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CleaningPage,
});

type CleaningStatus = "pending" | "accepted" | "in_progress" | "completed" | "problem";

const statusMeta: Record<CleaningStatus, { tone: "warning" | "info" | "success" | "destructive" | "muted" }> = {
  pending: { tone: "warning" }, accepted: { tone: "info" }, in_progress: { tone: "info" },
  completed: { tone: "success" }, problem: { tone: "destructive" },
};

type View = "open" | "upcoming" | "problem" | "review" | "done" | "all";

interface Task {
  id: string;
  room_id: string;
  property_id: string;
  cleaner_id: string | null;
  due_at: string;
  status: CleaningStatus;
  photos_count: number;
  notes: string | null;
  inspection_state: InspectionState;
  inspected_at: string | null;
  inspection_note: string | null;
}
interface Room { id: string; number: string; floor: number | null }
interface Property { id: string; name: string }
interface Cleaner { id: string; full_name: string; active: boolean; user_id: string | null }

function CleaningPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const perm = usePermissions();
  const canAssign = perm.can("assign_cleaning");
  const [view, setView] = useState<View>("open");
  const [prop, setProp] = useState("all");
  const [reporting, setReporting] = useState<{ taskId: string; roomId: string } | null>(null);
  const [reviewing, setReviewing] = useState<{ id: string; action: "approve" | "reject" | "reopen"; to?: CleaningStatus } | null>(null);
  const [reason, setReason] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["cleaning-page"],
    queryFn: async () => {
      const todayStr = businessDate();
      const [userRes, ts, rm, pr, cl, options, outs] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("cleaning_tasks")
          .select("id,room_id,property_id,cleaner_id,due_at,status,photos_count,notes,inspection_state,inspected_at,inspection_note")
          .order("due_at", { ascending: true }),
        supabase.from("rooms").select("id,number,floor"),
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("cleaners").select("id,full_name,active,user_id").order("full_name"),
        supabase.rpc("cleaning_assignment_options"),
        supabase.from("reservations").select("room_id,guest_name").eq("check_out", todayStr).is("deleted_at", null).in("status", ["confirmed", "checked_in", "tentative"]),
      ]);
      const err = ts.error ?? rm.error ?? pr.error ?? cl.error ?? options.error;
      if (err) throw err;
      const uid = userRes.data.user?.id ?? null;
      return {
        tasks: (ts.data ?? []) as Task[],
        rooms: (rm.data ?? []) as Room[],
        properties: (pr.data ?? []) as Property[],
        cleaners: (cl.data ?? []) as Cleaner[],
        assignmentOptions: options.data ?? [],
        myCleanerId: (cl.data ?? []).find((c) => c.user_id === uid)?.id ?? null,
        leavingToday: new Map((outs.data ?? []).map((r) => [r.room_id as string, (r.guest_name as string | null) ?? ""])),
      };
    },
  });

  const tasks = data?.tasks ?? [];
  const rooms = useMemo(() => new Map((data?.rooms ?? []).map((r) => [r.id, r])), [data]);
  const properties = data?.properties ?? [];
  const cleaners = data?.cleaners ?? [];
  const myCleanerId = data?.myCleanerId ?? null;
  const cleanerName = (id: string | null) => (id ? cleaners.find((c) => c.id === id)?.full_name : undefined);

  // Field staff: starting an assigned task auto-starts the work shift (GPS-verified, once per day).
  const autoClockIn = async (taskId: string) => {
    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
      );
    });
    if (!position) {
      toast.warning(t("cleaning.shiftNoLocation"));
      return;
    }
    const { error } = await supabase.rpc("clock_start_for_task", {
      _task_id: taskId,
      _lat: position.coords.latitude,
      _lng: position.coords.longitude,
      _accuracy: position.coords.accuracy,
    });
    if (error) toast.warning(t("cleaning.shiftStartFailed"));
    else toast.success(t("cleaning.shiftStarted"));
  };

  const update = async (id: string, status: CleaningStatus) => {
    if (tasks.find((task) => task.id === id)?.status === "completed") {
      setReason(""); setReviewing({ id, action: "reopen", to: status }); return;
    }
    const { error } = await supabase.rpc("transition_cleaning_task", { _task_id: id, _to: status });
    if (error) { toast.error(t("cleaning.actionFailed")); return; }
    // Folded older tasks of the same room follow the same step (one cleaning covers them all).
    for (const sib of mergedInto.get(id) ?? []) {
      const s = tasks.find((x) => x.id === sib)?.status;
      if (status === "completed" && s !== "in_progress") await supabase.rpc("transition_cleaning_task", { _task_id: sib, _to: "in_progress" });
      await supabase.rpc("transition_cleaning_task", { _task_id: sib, _to: status });
    }
    await refreshCleaningQueries(queryClient);
    toast.success(t("cleaning.statusChanged", { status: t(`status.${status}`) }));
    if (status === "in_progress" && myCleanerId && tasks.find((x) => x.id === id)?.cleaner_id === myCleanerId) {
      void autoClockIn(id);
    }
  };

  const saveReview = async () => {
    if (!reviewing) return;
    if (reviewing.action !== "approve" && !validCleaningReason(reason)) {
      toast.error(t("cleaningInspection.reasonRequired")); return;
    }
    setSavingReview(true);
    const result = reviewing.action === "reopen"
      ? await supabase.rpc("reopen_cleaning_task", { _task_id: reviewing.id, _to: reviewing.to === "pending" ? "pending" : "in_progress", _reason: reason.trim() })
      : await supabase.rpc("review_cleaning_task", { _task_id: reviewing.id, _approved: reviewing.action === "approve", _reason: reason.trim() });
    setSavingReview(false);
    if (result.error) { toast.error(t("cleaning.actionFailed")); return; }
    await refreshCleaningQueries(queryClient);
    setReviewing(null); setReason("");
    toast.success(t(reviewing.action === "approve" ? "cleaningInspection.approved" : reviewing.action === "reject" ? "cleaningInspection.rejected" : "cleaningInspection.reopen"));
  };

  const reassign = async (taskId: string, cleanerId: string) => {
    const { error } = await supabase.rpc("assign_cleaning_task", { _task_id: taskId, ...(cleanerId ? { _cleaner_id: cleanerId } : {}) });
    if (error) { toast.error(t("cleaning.actionFailed")); return; }
    toast.success(cleanerId ? t("cleaning.assigned") : t("cleaning.unassigned"));
    await refreshCleaningQueries(queryClient);
  };

  const taskActions = (task: Task, name: string | undefined, compact: boolean) => (
    <>
                          {cleaningNeedsReview(task) && canAssign && <>
                            <ActionBtn compact={compact} icon={<Check className="w-4 h-4" />} onClick={() => { setReason(""); setReviewing({ id: task.id, action: "approve" }); }}>{t("cleaningInspection.approve")}</ActionBtn>
                            <SecBtn compact={compact} tone="warning" icon={<RotateCcw className="w-4 h-4" />} label={t("cleaningInspection.reject")} onClick={() => { setReason(""); setReviewing({ id: task.id, action: "reject" }); }} />
                          </>}
                          {task.status === "pending" && (
                            <ActionBtn compact={compact} onClick={() => update(task.id, "accepted")} icon={<Check className="w-4 h-4" />}>{t("cleaning.accept")}</ActionBtn>
                          )}
                          {(task.status === "accepted" || task.status === "problem") && (
                            <ActionBtn compact={compact} onClick={() => update(task.id, "in_progress")} icon={<Play className="w-4 h-4" />}>{t("cleaning.start")}</ActionBtn>
                          )}
                          {task.status === "in_progress" && (
                            <ActionBtn compact={compact} onClick={() => update(task.id, "completed")} icon={<Check className="w-4 h-4" />}>{t("cleaning.finish")}</ActionBtn>
                          )}
                          {task.status !== "pending" && (task.status !== "completed" || canAssign) && (
                            <SecBtn compact={compact} onClick={() => update(task.id, task.status === "accepted" ? "pending" : task.status === "completed" ? "in_progress" : "accepted")}
                              icon={<Undo2 className="w-4 h-4" />} label={t("common.undo")} />
                          )}
                          {isOpen(task.status) && (
                            <SecBtn compact={compact} tone="destructive" onClick={() => setReporting({ taskId: task.id, roomId: task.room_id })}
                              icon={<AlertTriangle className="w-4 h-4" />} label={t("cleaning.reportProblem")} />
                          )}
                          {canAssign && (
                            <SecBtn compact={compact} tone="warning" onClick={() => update(task.id, "pending")} icon={<RotateCcw className="w-4 h-4" />} label={t("common.reset")} />
                          )}
                          {name && canAssign && (
                            <SecBtn compact={compact} onClick={() => toast.info(`WhatsApp → ${name}`)} icon={<MessageCircle className="w-4 h-4" />} label={t("cleaning.notify")} />
                          )}
    </>
  );
  const assignControl = (task: Task, name: string | undefined, compact: boolean) => {
    const options = taskAssignmentOptions(data?.assignmentOptions ?? [], task.property_id);
    const unassigned = !task.cleaner_id;
    return options.length > 0 && canChangeCleaningAssignment(task.status) ? (
      <select value={task.cleaner_id ?? ""} aria-label={t("departments.assign")} onChange={(e) => reassign(task.id, e.target.value)}
        className={`w-full rounded-xl border bg-card text-sm ${compact ? "h-9 px-2" : "min-h-11 px-3"} ${unassigned ? "border-warning text-warning" : "border-input"}`}>
        <option value="">— {t("cleaning.notAssigned")} —</option>
        {task.cleaner_id && !options.some((o) => o.cleaner_id === task.cleaner_id) && <option value={task.cleaner_id} disabled>{name ?? t("cleaning.notAssigned")}</option>}
        {options.map((c) => <option key={c.cleaner_id} value={c.cleaner_id}>{c.full_name}</option>)}
      </select>
    ) : (
      <span className={`inline-flex items-center gap-1.5 ${unassigned ? "text-warning italic" : "font-medium"}`}>{unassigned && <UserX className="w-4 h-4" />}{name ?? t("cleaning.notAssigned")}</span>
    );
  };
  const dueText = (task: Task) => new Date(task.due_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const statusBadge = (task: Task) => { const review = cleaningNeedsReview(task); return <Badge tone={review ? "warning" : statusMeta[task.status].tone}>{review ? t("cleaningInspection.review") : t(`status.${task.status}`)}</Badge>; };
  const noteLines = (task: Task) => <>
    {task.notes && <div className="mt-1 text-xs italic text-muted-foreground break-words">"{task.notes}"</div>}
    {task.inspected_at && <div className="text-xs text-muted-foreground mt-1 break-words">{t("cleaningInspection.history")} · {new Date(task.inspected_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE })}{task.inspection_note ? ` · ${task.inspection_note}` : ""}</div>}
  </>;
  const isOpen = (s: CleaningStatus) => s === "pending" || s === "accepted" || s === "in_progress";
  // Today's work = open tasks due today or earlier (Berlin); later checkouts wait under "upcoming".
  const today = businessDate();
  const dueDay = (x: Task) => businessDate(new Date(x.due_at));
  const isDueRaw = (x: Task) => isOpen(x.status) && dueDay(x) <= today;
  // One room = one card: older unfinished checkouts of the same room fold into the newest task.
  const mergedInto = new Map<string, string[]>();
  const hiddenDup = new Set<string>();
  {
    const byRoom = new Map<string, Task[]>();
    tasks.filter(isDueRaw).forEach((x) => byRoom.set(x.room_id, [...(byRoom.get(x.room_id) ?? []), x]));
    byRoom.forEach((list) => {
      if (list.length < 2) return;
      const sorted = [...list].sort((a, b) => b.due_at.localeCompare(a.due_at));
      mergedInto.set(sorted[0].id, sorted.slice(1).map((x) => x.id));
      sorted.slice(1).forEach((x) => hiddenDup.add(x.id));
    });
  }
  const isDueNow = (x: Task) => isDueRaw(x) && !hiddenDup.has(x.id);
  const isUpcoming = (x: Task) => isOpen(x.status) && dueDay(x) > today;
  const leavingToday = data?.leavingToday ?? new Map<string, string>();
  const occupancyLine = (task: Task) => {
    if (!isDueNow(task)) return null;
    const extra = mergedInto.get(task.id)?.length ?? 0;
    const guest = leavingToday.get(task.room_id);
    return <div className="mt-1 space-y-0.5 text-xs">
      {guest !== undefined
        ? <div className="font-medium text-warning">{t("cleaning.leavingToday", { name: guest || "—", time: new Date(task.due_at).toLocaleTimeString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit" }) })}</div>
        : <div className="font-medium text-success">{t("cleaning.roomFree")}</div>}
      {extra > 0 && <div className="text-muted-foreground">{t("cleaning.mergedCheckouts", { count: extra })}</div>}
    </div>;
  };
  const counts = {
    open: tasks.filter(isDueNow).length,
    upcoming: tasks.filter(isUpcoming).length,
    problem: tasks.filter((x) => x.status === "problem").length,
    review: tasks.filter(cleaningNeedsReview).length,
    done: tasks.filter((x) => x.status === "completed" && !cleaningNeedsReview(x)).length,
    unassigned: tasks.filter((x) => !x.cleaner_id && isDueNow(x)).length,
  };

  const filtered = tasks.filter((x) => {
    if (prop !== "all" && x.property_id !== prop) return false;
    if (view === "open") return isDueNow(x);
    if (view === "upcoming") return isUpcoming(x);
    if (view === "problem") return x.status === "problem";
    if (view === "review") return cleaningNeedsReview(x);
    if (view === "done") return x.status === "completed" && !cleaningNeedsReview(x);
    return true;
  });

  // Never hide a visible task just because its location name is not readable.
  const known = new Set(properties.map((p) => p.id));
  const orphanItems = filtered.filter((x) => !known.has(x.property_id));
  const groups = [
    ...properties.map((p) => ({ ...p, items: filtered.filter((x) => x.property_id === p.id) })),
    ...(orphanItems.length ? [{ id: "unknown", name: "—", items: orphanItems }] : []),
  ].filter((g) => g.items.length > 0);

  const views: { id: View; label: string; n: number }[] = [
    { id: "open", label: t("cleaning.toDo"), n: counts.open },
    { id: "upcoming", label: t("cleaning.upcoming"), n: counts.upcoming },
    { id: "problem", label: t("cleaning.problems"), n: counts.problem },
    { id: "review", label: t("cleaningInspection.review"), n: counts.review },
    { id: "done", label: t("cleaning.done"), n: counts.done },
    { id: "all", label: t("common.all"), n: tasks.length },
  ];

  return (
    <AppShell
      title={t("pages.cleaning.title")}
      subtitle={t("cleaning.subtitle", { open: counts.open, unassigned: counts.unassigned })}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard highlight icon={<Sparkles className="w-4 h-4" />} label={t("cleaning.toDo")} value={counts.open} onClick={() => setView("open")} />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label={t("cleaning.problems")} value={counts.problem} onClick={() => setView("problem")} />
        <StatCard icon={<Check className="w-4 h-4" />} label={t("cleaning.done")} value={counts.done} onClick={() => setView("done")} />
        <StatCard icon={<UserX className="w-4 h-4" />} label={t("cleaning.notAssigned")} value={counts.unassigned} />
      </div>

      <div className="grid gap-2 mb-4 sm:flex sm:items-center">
        <div className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-1">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-pressed={view === v.id}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 min-h-10 text-sm font-medium transition-colors ${view === v.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {v.label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${view === v.id ? "bg-primary-foreground/20" : "bg-card"}`}>{v.n}</span>
            </button>
          ))}
        </div>
        <select value={prop} onChange={(e) => setProp(e.target.value)} aria-label={t("rooms.allProperties")} className="w-full sm:w-56 sm:ml-auto min-h-11 px-3 rounded-xl border border-input bg-card text-sm">
          <option value="all">{t("rooms.allProperties")}</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {reporting && (
        <ReportIssueDialog roomId={reporting.roomId} taskId={reporting.taskId} roomLabel={rooms.get(reporting.roomId)?.number ?? ""}
          onClose={() => setReporting(null)}
          onDone={() => { void refreshCleaningQueries(queryClient); void queryClient.invalidateQueries({ queryKey: ["room-issues"] }); }} />
      )}
      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          {t("cleaning.loadError")}{" "}
          <button onClick={() => refetch()} className="underline font-medium">{t("rooms.retry")}</button>
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <Sparkles className="w-6 h-6 mx-auto mb-2 text-success" />
          {view === "open" ? t("cleaning.allClean") : t("cleaning.noTasks")}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const gOpen = g.items.filter((x) => isOpen(x.status)).length;
            const gProb = g.items.filter((x) => x.status === "problem").length;
            return (
              <details key={g.id} open className="group rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" />
                    <span className="font-semibold truncate">{g.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{g.items.length}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t("cleaning.groupSummary", { total: g.items.length, open: gOpen })}{gProb > 0 ? ` · ${t("cleaning.problemCount", { count: gProb })}` : ""}
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-border p-3 md:hidden">
                  {g.items.map((task) => {
                    const name = cleanerName(task.cleaner_id);
                    return (
                      <div key={task.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-2xl font-bold leading-none tabular-nums">#{rooms.get(task.room_id)?.number ?? "—"}</div>
                            <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">{dueText(task)}</div>
                          </div>
                          {statusBadge(task)}
                        </div>
                        <div className="min-w-0">{assignControl(task, name, false)}{noteLines(task)}</div>
                        <div className="grid grid-cols-2 gap-2">{taskActions(task, name, false)}</div>
                      </div>
                    );
                  })}
                </div>
                <table className="hidden w-full border-t border-border text-sm md:table">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr><th className="px-4 py-2 font-medium">{t("cleaning.room", "Zimmer")}</th><th className="px-3 py-2 font-medium">{t("cleaning.due", "Fällig")}</th><th className="px-3 py-2 font-medium">{t("cleaning.status", "Status")}</th><th className="px-3 py-2 font-medium">{t("departments.assign")}</th><th className="px-4 py-2" /></tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {g.items.map((task) => {
                      const name = cleanerName(task.cleaner_id);
                      return (
                        <tr key={task.id} className="align-middle hover:bg-accent/40">
                          <td className="px-4 py-2.5 font-semibold whitespace-nowrap">#{rooms.get(task.room_id)?.number ?? "—"}{task.photos_count > 0 && <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"><Camera className="w-3 h-3" />{task.photos_count}</span>}</td>
                          <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">{dueText(task)}</td>
                          <td className="px-3 py-2.5">{statusBadge(task)}</td>
                          <td className="px-3 py-2.5 min-w-48 max-w-72">{assignControl(task, name, true)}{noteLines(task)}</td>
                          <td className="px-4 py-2.5"><div className="flex flex-wrap justify-end gap-1.5">{taskActions(task, name, true)}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            );
          })}
        </div>
      )}
      <Dialog open={reviewing !== null} onOpenChange={(open) => { if (!open && !savingReview) setReviewing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t(reviewing?.action === "approve" ? "cleaningInspection.approve" : reviewing?.action === "reject" ? "cleaningInspection.reject" : "cleaningInspection.reopen")}</DialogTitle></DialogHeader>
          <label className="space-y-2 text-sm">{t(reviewing?.action === "approve" ? "cleaningInspection.note" : "cleaningInspection.reason")}
            <textarea aria-label={t(reviewing?.action === "approve" ? "cleaningInspection.note" : "cleaningInspection.reason")} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border border-input bg-card p-3" rows={3} />
          </label>
          <DialogFooter><Button variant="outline" disabled={savingReview} onClick={() => setReviewing(null)}>{t("common.cancel")}</Button><Button disabled={savingReview} onClick={saveReview}>{t("common.save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ActionBtn({ onClick, icon, children, compact }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; compact?: boolean }) {
  return (
    <Button onClick={onClick} className={compact ? "h-8 px-3 rounded-lg text-xs gap-1" : "h-auto col-span-2 min-h-12 text-base font-semibold px-3 rounded-xl inline-flex items-center justify-center gap-2 whitespace-normal shadow-sm"}>
      {icon} {children}
    </Button>
  );
}

function SecBtn({ onClick, icon, label, tone, compact }: { onClick: () => void; icon: React.ReactNode; label: string; tone?: "destructive" | "warning"; compact?: boolean }) {
  const c = tone === "destructive" ? "border-destructive/40 text-destructive hover:bg-destructive/5" : tone === "warning" ? "border-warning/40 text-warning hover:bg-warning/5" : "border-input bg-card hover:bg-accent";
  return (
    <Button variant="outline" onClick={onClick} aria-label={label} title={label} className={`${compact ? "h-8 w-8 p-0 rounded-lg" : "h-auto min-h-11 px-2 rounded-xl"} inline-flex items-center justify-center gap-1.5 text-xs font-medium border whitespace-normal ${c}`}>
      {icon}{!compact && <span>{label}</span>}
    </Button>
  );
}

function StatCard({ icon, label, value, highlight, onClick }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <div className={`flex items-center gap-1.5 text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{icon} {label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
    </>
  );
  const cls = `rounded-2xl px-5 py-4 shadow-sm ${highlight ? "brand-tile" : "border border-border bg-card"}`;
  if (onClick) {
    return (
      <button onClick={onClick} className={`${cls} w-full text-left hover:ring-2 hover:ring-primary/40 transition-shadow`}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
