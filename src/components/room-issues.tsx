import { displayLocale } from "@/i18n/legacy-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { Button } from "@/components/ui/button";
import { maintenanceWorkerAllowed, type MaintenanceBoard } from "@/lib/maintenance-assignment";

import { ISSUE_CATEGORIES, validIssue } from "@/lib/cleaning-inspection";
export { ISSUE_CATEGORIES } from "@/lib/cleaning-inspection";

export function ReportIssueDialog({ roomId, roomLabel, taskId, onClose, onDone }: {
  roomId: string; roomLabel: string; taskId?: string; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<string>("damage");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!validIssue(category, description)) { toast.error(t("cleaning.actionFailed")); return; }
    setSaving(true);
    const { error } = await supabase.rpc("report_room_issue", {
      _room_id: roomId, ... (taskId ? { _task_id: taskId } : {}), _category: category, _description: description.trim(),
    });
    setSaving(false);
    if (error) { toast.error(t("cleaning.actionFailed")); return; }
    toast.success(t("issues.reported"));
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{t("issues.reportTitle", { room: roomLabel })}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.close")}><X className="w-4 h-4" /></Button>
        </div>
        <label className="text-xs text-muted-foreground">{t("issues.category")}</label>
        <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
          {ISSUE_CATEGORIES.map((c) => (
            <Button variant="outline" key={c} onClick={() => setCategory(c)} aria-pressed={category === c}
              className={`text-sm px-3 py-2 rounded-lg border ${category === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-input bg-card"}`}>
              {t(`issues.categories.${c}`)}
            </Button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">{t("issues.description")}</label>
        <textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder={t("issues.placeholder")}
          className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-base" />
        <div className="mt-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <span>{t("issues.maintenanceWarning", { room: roomLabel })}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button variant="outline" disabled={saving} onClick={onClose} className="h-auto px-3 py-3 text-base">{t("common.cancel")}</Button>
          <Button variant="destructive" disabled={saving} onClick={save} className="h-auto whitespace-normal px-3 py-3 text-base">
            {t("issues.sendAndMaintain")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OpenIssuesList({ canResolve, roomLabel, showEmpty = false }: { canResolve: boolean; roomLabel: (id: string) => string; showEmpty?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: board, error, isLoading } = useQuery({
    queryKey: ["room-issues"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("maintenance_board");
      if (error) throw error;
      return data as unknown as MaintenanceBoard;
    },
  });
  const data = board?.issues ?? [];
  const workers = board?.workers ?? [];
  const [assigning, setAssigning] = useState<string | null>(null);
  const assign = async (id: string, userId: string) => {
    if (!maintenanceWorkerAllowed(workers, userId)) return;
    setAssigning(id);
    try {
      const { error } = await supabase.rpc("assign_room_issue", { _issue_id: id, ...(userId ? { _user_id: userId } : {}) });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["room-issues"] });
      toast.success(t("departments.saved"));
    } catch { toast.error(t("cleaning.actionFailed")); }
    finally { setAssigning(null); }
  };

  const [confirming, setConfirming] = useState<{ id: string; room: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async () => {
    if (!confirming) return;
    setBusy(true);
    const { error } = await supabase.rpc("resolve_room_issue", { _issue_id: confirming.id, _note: note.trim() || undefined });
    setBusy(false);
    if (error) { toast.error(t("cleaning.actionFailed")); return; }
    toast.success(t("issues.resolved"));
    setConfirming(null); setNote("");
    qc.invalidateQueries({ queryKey: ["room-issues"] });
  };

  if (error) return <div role="alert" className="text-sm text-destructive">{t("cleaning.loadError")} <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["room-issues"] })}>{t("rooms.retry")}</Button></div>;
  if (isLoading) return showEmpty ? <div className="text-muted-foreground">{t("common.loading")}</div> : null;
  if (data.length === 0) return showEmpty ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground"><Check className="w-7 h-7 mx-auto mb-2 text-success" />{t("departments.noOpenIssues")}</div> : null;
  const unassignedCount = data.filter((i) => !i.assigned_to).length;
  return (
    <div className="mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wrench className="w-4 h-4 text-destructive" />{t("issues.openTitle", { count: data.length })}</div>
          <div className="text-3xl font-semibold tabular-nums mt-1">{data.length}</div>
        </div>
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="w-4 h-4 text-warning" />{t("cleaning.notAssigned")}</div>
          <div className="text-3xl font-semibold tabular-nums mt-1">{unassignedCount}</div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {data.map((i) => (
          <div key={i.id} className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-border border-l-[6px] bg-card p-4 text-sm shadow-sm ${i.assigned_to ? "border-l-info" : "border-l-destructive"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-2xl font-bold leading-none tabular-nums">#{roomLabel(i.room_id) === "—" ? i.room_number : roomLabel(i.room_id)}</div>
                <div className="mt-1.5 text-xs text-muted-foreground break-words">{i.property_name}</div>
              </div>
              <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">{t(`issues.categories.${i.category}`)}</span>
            </div>
            <p className="rounded-lg bg-muted px-3 py-2 break-words">{i.description}</p>
            <div className="text-xs text-muted-foreground">
              {i.reporter && `${i.reporter} · `}
              {new Date(i.created_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="mt-auto space-y-2">
              {i.can_assign ? <select aria-label={t("departments.maintenanceAssign")} value={i.assigned_to ?? ""} disabled={assigning === i.id}
                onChange={(e) => void assign(i.id, e.target.value)} className={`w-full min-h-11 rounded-xl border bg-card px-3 text-sm ${i.assigned_to ? "border-input" : "border-warning text-warning"}`}>
                <option value="">{t("cleaning.notAssigned")}</option>
                {i.assigned_to && !workers.some((w) => w.user_id === i.assigned_to) && <option value={i.assigned_to} disabled>{i.assignee || t("departments.unnamed")}</option>}
                {workers.map((w) => <option key={w.user_id} value={w.user_id}>{w.full_name || t("departments.unnamed")}</option>)}
              </select> : <div className={i.assignee ? "font-medium" : "italic text-warning"}>{i.assignee || t("cleaning.notAssigned")}</div>}
              {i.assigned_at && <div className="text-xs text-muted-foreground">{t("departments.assignedBy", { name: i.assigner || t("departments.unnamed") })} · {new Date(i.assigned_at).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>}
              {(canResolve || (i as any).can_resolve) && (
                <Button onClick={() => setConfirming({ id: i.id, room: roomLabel(i.room_id) === "—" ? i.room_number : roomLabel(i.room_id) })} className="h-auto min-h-12 w-full rounded-xl text-base font-semibold">
                  <Check className="w-4 h-4" />{t("issues.markResolved")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 p-4" onClick={() => setConfirming(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold mb-2">{t("issues.confirmTitle", { room: confirming.room })}</h2>
            <p className="text-sm text-muted-foreground mb-3">{t("issues.confirmText")}</p>
            <label className="text-xs text-muted-foreground">{t("issues.resolutionNote")}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder={t("issues.resolutionPlaceholder")}
              className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-base" />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => setConfirming(null)} className="px-3 py-3 rounded-xl border border-input">{t("common.cancel")}</button>
              <button disabled={busy} onClick={resolve} className="px-3 py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">{t("issues.confirmResolve")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
