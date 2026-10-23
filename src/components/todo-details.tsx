import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { TodoAttachments } from "./todo-attachments";
import { loadTodoOptions } from "@/lib/todo-data.functions";
export function TodoDetails({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const { t } = useTranslation(); const qc = useQueryClient(); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const names=useQuery({queryKey:["todo-options"],queryFn:()=>loadTodoOptions()});
  const q = useQuery({ queryKey: ["todo-detail", id], queryFn: async () => {
    const [task, events] = await Promise.all([supabase.from("todos").select("notes,reminder_at,reminder_status").eq("id", id).single(), supabase.from("todo_activity").select("id,kind,body,created_at,actor_id").eq("todo_id", id).order("created_at", { ascending: false })]);
    if (task.error || events.error) throw new Error("unavailable"); return { task: task.data, events: events.data ?? [] };
  } });
  const save = async () => { setBusy(true); const { error } = await supabase.rpc("general_todo_action", { _id: id, _action: "note", _note: note }); setBusy(false); if (error) { toast.error(t("todos.saveErr")); return; } setNote(""); await qc.invalidateQueries({ queryKey: ["todo-detail", id] }); };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-auto"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    {q.isError ? <p role="alert">{t("todos.saveErr")}</p> : q.data ? <><p className="text-sm whitespace-pre-wrap">{q.data.task.notes}</p><p className="text-sm text-muted-foreground">{t(`todoDetails.${q.data.task.reminder_status}`)}</p>{q.data.task.reminder_at && <p className="text-xs">{new Date(q.data.task.reminder_at).toLocaleString(undefined, { timeZone: BUSINESS_TIME_ZONE })}</p>}<h3 className="font-semibold text-sm">{t("todoDetails.history")}</h3><div className="divide-y divide-border">{q.data.events.map((e) => <div key={e.id} className="py-2"><p className="text-sm">{t(`todoDetails.${e.kind}`)}{e.body ? ` · ${e.body}` : ""}</p><time className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString(undefined, { timeZone: BUSINESS_TIME_ZONE })}</time></div>)}</div></> : <p>{t("common.loading")}</p>}
    <Input aria-label={t("todoDetails.note")} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder={t("todoDetails.note")} /><Button disabled={!note.trim() || busy} onClick={save}>{t("todoDetails.note")}</Button><TodoAttachments id={id} />
  </DialogContent></Dialog>;
}