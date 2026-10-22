import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
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
          className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-card text-sm" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-input">{t("common.cancel")}</button>
          <button disabled={saving} onClick={save} className="px-3 py-2 text-sm rounded-lg bg-destructive text-destructive-foreground disabled:opacity-50">
            {t("issues.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OpenIssuesList({ canResolve, roomLabel }: { canResolve: boolean; roomLabel: (id: string) => string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["room-issues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_issues")
        .select("id,room_id,category,description,status,created_at,reported_by")
        .eq("status", "open").order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((d) => d.reported_by).filter(Boolean))] as string[];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string | null }[] };
      const names = new Map((profs ?? []).map((p) => [p.id, p.full_name || ""]));
      return (data ?? []).map((d) => ({ ...d, reporter: d.reported_by ? names.get(d.reported_by) ?? "" : "" }));
    },
  });

  const resolve = async (id: string) => {
    const { error } = await supabase.from("room_issues").update({ status: "resolved" }).eq("id", id);
    if (error) { toast.error(t("cleaning.actionFailed")); return; }
    toast.success(t("issues.resolved"));
    qc.invalidateQueries({ queryKey: ["room-issues"] });
  };

  if (data.length === 0) return null;
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 mb-4">
      <div className="flex items-center gap-2 font-semibold text-sm mb-2"><Wrench className="w-4 h-4 text-destructive" />{t("issues.openTitle", { count: data.length })}</div>
      <div className="divide-y divide-border/60">
        {data.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <span className="font-semibold w-16">#{roomLabel(i.room_id)}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">{t(`issues.categories.${i.category}`)}</span>
            <span className="flex-1 min-w-[160px]">{i.description}</span>
            <span className="text-xs text-muted-foreground">
              {i.reporter && `${i.reporter} · `}
              {new Date(i.created_at).toLocaleString("de-DE", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            {canResolve && (
              <button onClick={() => resolve(i.id)} className="text-xs px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-1">
                <Check className="w-3 h-3" />{t("issues.markResolved")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
