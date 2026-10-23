import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { toast } from "sonner";
type OvertimeEntry = { id: string; cleaner_id: string; name: string; property: string; clock_in_at: string; net_minutes: number; minutes: number; rate: number | null; approved_at: string | null; approved_by: string; reason: string | null; can_approve: boolean };
type Board = { can_set_rates: boolean; staff: { id: string; name: string; rate: number | null }[]; entries: OvertimeEntry[] };
export function OvertimePanel({ from, to }: { from: string; to: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [rate, setRate] = useState("");
  const [entry, setEntry] = useState<OvertimeEntry | null>(null);
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const board = useQuery({ queryKey: ["overtime-board", from, to], queryFn: async () => {
    const { data, error } = await supabase.rpc("overtime_board", { _from: from, _to: to });
    if (error) throw error;
    return data as unknown as Board;
  } });
  const invalidate = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["overtime-board"] }), qc.invalidateQueries({ queryKey: ["time-entries"] }), qc.invalidateQueries({ queryKey: ["overtime-pay"] })]); };
  const saveRate = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc("set_employee_overtime_rate", { _cleaner_id: staffId, _rate: Number(rate) });
    if (error) throw error;
  }, onSuccess: async () => { await invalidate(); toast.success(t("overtime.saved")); }, onError: () => toast.error(t("overtime.failed")) });
  const approve = useMutation({ mutationFn: async () => {
    if (!entry) return;
    const { error } = await supabase.rpc("approve_time_entry_overtime", { _entry_id: entry.id, _minutes: Number(minutes), _reason: reason });
    if (error) throw error;
  }, onSuccess: async () => { await invalidate(); setEntry(null); toast.success(t("overtime.saved")); }, onError: (e: Error) => toast.error(t(e.message.includes("overtime_rate_required") ? "overtime.rateRequired" : "overtime.failed")) });
  if (board.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (board.isError) return <p className="text-sm text-destructive">{t("overtime.loadingFailed")}</p>;
  const data = board.data;
  return <div className="space-y-5">
    {data.can_set_rates && <div className="space-y-3 border-b border-border pb-5">
      <h2 className="font-semibold">{t("overtime.rateTitle")}</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-48"><Label>{t("overtime.staff")}</Label><Select value={staffId} onValueChange={id => { setStaffId(id); const value = data.staff.find(s => s.id === id)?.rate; setRate(value == null ? "" : String(value)); }}><SelectTrigger><SelectValue placeholder={t("overtime.choose")} /></SelectTrigger><SelectContent>{data.staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        {staffId && <><div><Label htmlFor="overtime-rate">{t("overtime.rate")}</Label><Input id="overtime-rate" type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></div><Button disabled={rate === "" || !Number.isFinite(Number(rate)) || Number(rate) < 0 || saveRate.isPending} onClick={() => saveRate.mutate()}>{t("overtime.save")}</Button></>}
      </div>
    </div>}
    <h2 className="font-semibold">{t("overtime.title")}</h2>
    {data.entries.length === 0 ? <p className="text-sm text-muted-foreground">{t("overtime.noResults")}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground">{["staff", "date", "total", "overtime", "approval"].map(k => <th className="p-3 font-medium" key={k}>{t(`overtime.${k}`)}</th>)}</tr></thead><tbody>{data.entries.map(e => <tr key={e.id} className="border-b border-border"><td className="p-3"><div className="font-medium">{e.name}</div><div className="text-xs text-muted-foreground">{e.property}</div></td><td className="p-3 whitespace-nowrap">{new Date(e.clock_in_at).toLocaleDateString(i18n.language, { timeZone: BUSINESS_TIME_ZONE })}</td><td className="p-3">{e.net_minutes} min</td><td className="p-3">{e.minutes} min</td><td className="p-3"><div className="space-y-1">{e.approved_at && <><div className="text-xs">{t("overtime.approved")}: {e.approved_by}</div><div className="text-xs text-muted-foreground">{new Date(e.approved_at).toLocaleString(i18n.language, { timeZone: BUSINESS_TIME_ZONE })}</div><div className="text-xs">{e.reason}</div></>}{e.can_approve && <Button variant="outline" size="sm" onClick={() => { setEntry(e); setMinutes(String(e.minutes)); setReason(""); }}>{t("overtime.approve")}</Button>}</div></td></tr>)}</tbody></table></div>}
    <Dialog open={!!entry} onOpenChange={open => { if (!open) setEntry(null); }}><DialogContent><DialogHeader><DialogTitle>{entry?.name} · {t("overtime.approve")}</DialogTitle></DialogHeader><div className="space-y-3"><Label htmlFor="overtime-minutes">{t("overtime.minutes")}</Label><Input id="overtime-minutes" type="number" min="0" max={entry?.net_minutes} step="1" value={minutes} onChange={e => setMinutes(e.target.value)} /><p className="text-xs text-muted-foreground">{t("overtime.clear")}</p><Label htmlFor="overtime-reason">{t("overtime.reason")}</Label><Input id="overtime-reason" value={reason} onChange={e => setReason(e.target.value)} /></div><DialogFooter><Button variant="ghost" onClick={() => setEntry(null)}>{t("common.cancel")}</Button><Button disabled={approve.isPending || minutes === "" || !Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > (entry?.net_minutes ?? 0) || reason.trim().length < 3} onClick={() => approve.mutate()}>{t("overtime.approve")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}