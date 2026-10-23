import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Paperclip, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { validTodoAttachment } from "@/lib/todo-attachments";
export function TodoAttachments({ id }: { id:string }) {
  const {t}=useTranslation(); const qc=useQueryClient(); const input=useRef<HTMLInputElement>(null); const [busy,setBusy]=useState(false);
  const q=useQuery({queryKey:["todo-attachments",id],queryFn:async()=>{const {data,error}=await supabase.from("todo_attachments").select("id,file_name,object_path,size_bytes").eq("todo_id",id).order("created_at");if(error)throw error;return data??[];}});
  const refresh=()=>qc.invalidateQueries({queryKey:["todo-attachments",id]});
  const upload=async(file:File)=>{if(!validTodoAttachment(file))return toast.error(t("todoDetails.invalidFile"));setBusy(true);try{
    const reserved=await supabase.rpc("reserve_todo_attachment",{_todo:id,_file_name:file.name,_size:file.size,_type:file.type});if(reserved.error)throw reserved.error;
    const entry=reserved.data as {id:string;path:string};const result=await supabase.storage.from("todo-attachments").upload(entry.path,file,{contentType:file.type,upsert:false});
    if(result.error){await supabase.rpc("remove_todo_attachment",{_id:entry.id});throw result.error;}await refresh();
  }catch{toast.error(t("todos.saveErr"));}finally{setBusy(false);}};
  const download=async(path:string)=>{const result=await supabase.storage.from("todo-attachments").createSignedUrl(path,60,{download:true});if(result.error)return toast.error(t("todos.saveErr"));window.open(result.data.signedUrl,"_blank","noopener,noreferrer");};
  const remove=async(entry:{id:string;object_path:string})=>{setBusy(true);try{const result=await supabase.storage.from("todo-attachments").remove([entry.object_path]);if(result.error)throw result.error;const removed=await supabase.rpc("remove_todo_attachment",{_id:entry.id});if(removed.error)throw removed.error;await refresh();}catch{toast.error(t("todos.saveErr"));}finally{setBusy(false);}};
  return <div className="space-y-2"><h3 className="text-sm font-semibold">{t("todoDetails.attachments")}</h3><input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}} /><Button variant="outline" disabled={busy} onClick={()=>input.current?.click()}><Paperclip className="h-4 w-4" />{t("todoDetails.attach")}</Button>{q.isError&&<p role="alert">{t("todos.saveErr")}</p>}{q.data?.map(file=><div key={file.id} className="flex gap-2 items-center text-sm"><span className="min-w-0 flex-1 break-all">{file.file_name}</span><Button variant="ghost" size="icon" aria-label={t("todoDetails.download")} onClick={()=>download(file.object_path)}><Download className="h-4 w-4"/></Button><Button variant="ghost" size="icon" disabled={busy} aria-label={t("todos.del")} onClick={()=>remove(file)}><Trash2 className="h-4 w-4"/></Button></div>)}</div>;
}