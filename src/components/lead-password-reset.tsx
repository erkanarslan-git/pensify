import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { listResettableMembers, leadResetPassword } from "@/lib/lead-team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shown only to department chiefs who were given the password-reset power. */
export function LeadPasswordReset() {
  const { t } = useTranslation();
  const { data: members = [] } = useQuery({ queryKey: ["lead-resettable"], queryFn: () => listResettableMembers() });
  const [userId, setUserId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  if (!members.length) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await leadResetPassword({ data: { userId, password: pw } });
      toast.success(t("deptTodos.pwDone"));
      setPw(""); setUserId("");
    } catch { toast.error(t("deptTodos.pwFailed")); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" />{t("deptTodos.pwTitle")}</div>
      <p className="text-xs text-muted-foreground">{t("deptTodos.pwHint")}</p>
      <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
        <option value="">{t("deptTodos.pwPick")}</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <Input type="text" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("deptTodos.pwNew")} />
      <Button onClick={submit} disabled={busy || !userId || pw.length < 8} className="w-full">{t("deptTodos.pwSave")}</Button>
    </div>
  );
}
