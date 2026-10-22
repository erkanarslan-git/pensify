import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { Button } from "@/components/ui/button";
import { maintenanceWorkerAllowed, type MaintenanceBoard } from "@/lib/maintenance-assignment";

export const ISSUE_CATEGORIES = ["damage", "plumbing", "electric", "missing", "dirty", "other"] as const;

export function ReportIssueDialog({ roomId, roomLabel, taskId, onClose, onDone }: {
  roomId: string; roomLabel: string; taskId?: string; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<string>("damage");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!description.trim()) { toast.error(t("issues.descriptionRequired")); return; }
    setSaving(true);
    const { error } = await supabase.from("room_issues").insert({
      room_id: roomId, task_id: taskId ?? null, category, description: description.trim(),
      organization_id: "00000000-0000-0000-0000-000000000000", property_id: "00000000-0000-0000-0000-000000000000",
    });
    if (!error && taskId) await supabase.rpc("transition_cleaning_task", { _task_id: taskId, _to: "problem" });
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
          <button onClick={onClose} aria-label={t("common.close")}><X className="w-4 h-4" /></button>
        </div>
        <label className="text-xs text-muted-foreground">{t("issues.category")}</label>
        <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
          {ISSUE_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`text-sm px-3 py-2 rounded-lg border ${category === c ? "border-primary bg-primary/10 text-primary font-medium" : "border-input bg-card"}`}>
              {t(`issues.categories.${c}`)}
            </button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">{t("issues.description")}</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder={t("issues.placeholder")}
          className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-base" />
        <div className="mt-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
          <span>{t("issues.maintenanceWarning", { room: roomLabel })}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-3 text-base rounded-xl border border-input">{t("common.cancel")}</button>
          <button disabled={saving} onClick={save} className="px-3 py-3 text-base font-medium rounded-xl bg-destructive text-destructive-foreground disabled:opacity-50">
            {t("issues.sendAndMaintain")}
          </button>
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
    const { error } = await supabase.from("room_issues")
      .update({ status: "resolved", resolution_note: note.trim() || null }).eq("id", confirming.id);
    setBusy(false);
    if (error) { toast.error(t("cleaning.actionFailed")); return; }
    toast.success(t("issues.resolved"));
    setConfirming(null); setNote("");
    qc.invalidateQueries({ queryKey: ["room-issues"] });
  };

  if (error) return <div role="alert" className="text-sm text-destructive">{t("cleaning.loadError")} <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["room-issues"] })}>{t("rooms.retry")}</Button></div>;
  if (isLoading) return showEmpty ? <div className="text-muted-foreground">{t("common.loading")}</div> : null;
  if (data.length === 0) return showEmpty ? <div className="text-sm text-muted-foreground">{t("departments.noOpenIssues")}</div> : null;
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 mb-4">
      <div className="flex items-center gap-2 font-semibold text-sm mb-2"><Wrench className="w-4 h-4 text-destructive" />{t("issues.openTitle", { count: data.length })}</div>
      <div className="divide-y divide-border/60">
        {data.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <div className="min-w-24"><span className="font-semibold">#{roomLabel(i.room_id) === "—" ? i.room_number : roomLabel(i.room_id)}</span><div className="text-xs text-muted-foreground">{i.property_name}</div></div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">{t(`issues.categories.${i.category}`)}</span>
            <span className="flex-1 min-w-[160px]">{i.description}</span>
            <span className="text-xs text-muted-foreground">
              {i.reporter && `${i.reporter} · `}
              {new Date(i.created_at).toLocaleString("de-DE", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="w-full sm:w-auto space-y-1">
              {i.can_assign ? <select aria-label={t("departments.maintenanceAssign")} value={i.assigned_to ?? ""} disabled={assigning === i.id}
                onChange={(e) => void assign(i.id, e.target.value)} className="w-full sm:w-48 min-h-11 rounded-md border border-input bg-card px-2 text-sm">
                <option value="">{t("cleaning.notAssigned")}</option>
                {i.assigned_to && !workers.some((w) => w.user_id === i.assigned_to) && <option value={i.assigned_to} disabled>{i.assignee || t("departments.unnamed")}</option>}
                {workers.map((w) => <option key={w.user_id} value={w.user_id}>{w.full_name || t("departments.unnamed")}</option>)}
              </select> : <span className="text-sm">{i.assignee || t("cleaning.notAssigned")}</span>}
              {i.assigned_at && <div className="text-xs text-muted-foreground">{t("departments.assignedBy", { name: i.assigner || t("departments.unnamed") })} · {new Date(i.assigned_at).toLocaleString("de-DE", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>}
            </div>
            {canResolve && (
              <button onClick={() => setConfirming({ id: i.id, room: roomLabel(i.room_id) })} className="text-sm px-3 py-2 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-1">
                <Check className="w-4 h-4" />{t("issues.markResolved")}
              </button>
            )}
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
