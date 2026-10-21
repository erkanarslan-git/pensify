import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, endOfMonth, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { attendanceDays, localWorkDate } from "@/lib/attendance";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const weekdayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const kinds = ["sick", "leave", "excused", "unexcused"];

export function EmployeeAttendance({ userId }: { userId?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("manage_team");
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedMember, setSelectedMember] = useState("");
  const [workdays, setWorkdays] = useState<number[]>([]);
  const [effective, setEffective] = useState(format(new Date(), "yyyy-MM-dd"));
  const [start, setStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [kind, setKind] = useState("sick");
  const [note, setNote] = useState("");
  const [correction, setCorrection] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const from = `${month}-01`;
  const to = month ? format(endOfMonth(parseISO(from)), "yyyy-MM-dd") : "";
  const q = useQuery({
    queryKey: ["employee-attendance", month],
    enabled: !!month,
    queryFn: async () => {
      const orgRes = await supabase.rpc("active_organization_id");
      if (orgRes.error) throw orgRes.error;
      if (!orgRes.data) throw new Error("organization_required");
      const org = orgRes.data;
      const results = await Promise.all([
        supabase.from("organization_members").select("id,user_id,organization_id,active").eq("organization_id", org),
        supabase.from("profiles").select("id,full_name"),
        supabase.from("employee_work_schedules").select("*").eq("organization_id", org).lte("effective_from", to),
        supabase.from("employee_absences").select("*").eq("organization_id", org).lte("start_date", to).gte("end_date", from).order("created_at", { ascending: false }),
        supabase.from("cleaners").select("id,user_id,full_name").eq("organization_id", org),
        supabase.from("time_entries").select("cleaner_id,clock_in_at,clock_out_at,break_minutes").eq("organization_id", org).gte("clock_in_at", new Date(Date.parse(`${from}T00:00:00Z`) - 86400000).toISOString()).lt("clock_in_at", new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86400000).toISOString()),
        supabase.from("organizations").select("timezone").eq("id", org).single(),
      ]);
      for (const result of results) if (result.error) throw result.error;
      const [members, profiles, schedules, absences, cleaners, entries, organization] = results;
      return { members: members.data ?? [], profiles: profiles.data ?? [], schedules: schedules.data ?? [], absences: absences.data ?? [], cleaners: cleaners.data ?? [], entries: entries.data ?? [], timezone: organization.data?.timezone ?? "Europe/Berlin", org };
    },
  });
  const data = q.data;
  const members = data?.members.filter(m => !userId || m.user_id === userId) ?? [];
  const member = members.find(m => m.id === selectedMember) ?? members[0];
  useEffect(() => {
    const schedule = data?.schedules.filter(s => s.member_id === member?.id && s.effective_from <= effective).sort((a,b) => b.effective_from.localeCompare(a.effective_from))[0];
    setWorkdays(schedule?.weekdays ?? []);
  }, [member?.id, data?.schedules, effective]);
  const name = (uid: string) => data?.profiles.find(p => p.id === uid)?.full_name || data?.cleaners.find(c => c.user_id === uid)?.full_name || "—";
  const report = members.map(m => {
    const cleanerIds = new Set(data?.cleaners.filter(c => c.user_id === m.user_id).map(c => c.id));
    const entries = data?.entries.filter(e => cleanerIds.has(e.cleaner_id) && localWorkDate(e.clock_in_at, data.timezone) >= from && localWorkDate(e.clock_in_at, data.timezone) <= to) ?? [];
    const workedDates = new Set(entries.map(e => localWorkDate(e.clock_in_at, data?.timezone ?? "Europe/Berlin")));
    const minutes = entries.reduce((sum,e) => sum + (e.clock_out_at ? Math.max(0, (Date.parse(e.clock_out_at) - Date.parse(e.clock_in_at)) / 60000 - e.break_minutes) : 0), 0);
    const days = attendanceDays(m.id, from, to, data?.schedules ?? [], data?.absences ?? [], workedDates);
    return { member: m, days, minutes, counts: Object.fromEntries(kinds.map(k => [k, days.filter(d => d.status === k).length])) };
  });
  const current = report.find(r => r.member.id === member?.id);
  const mutation = useMutation({
    mutationFn: async (action: "schedule" | "absence" | "cancel") => {
      if (!member || !data || !canManage) throw new Error("permission_required");
      if (action === "schedule") {
        const result = await supabase.from("employee_work_schedules").upsert({ organization_id: data.org, member_id: member.id, effective_from: effective, weekdays: workdays }, { onConflict: "member_id,effective_from" });
        if (result.error) throw result.error;
      } else if (action === "absence") {
        const result = await supabase.from("employee_absences").insert({ organization_id: data.org, member_id: member.id, start_date: start, end_date: end, kind, note: note.trim() });
        if (result.error) throw result.error;
      } else {
        if (!cancelling || !correction.trim()) throw new Error("correction_required");
        const result = await supabase.from("employee_absences").update({ cancelled: true, correction_reason: correction.trim() }).eq("id", cancelling).eq("member_id", member.id).select("id").single();
        if (result.error) throw result.error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-attendance"] }); setNote(""); setCancelling(null); setCorrection(""); toast.success(t("attendance.saved")); },
    onError: () => toast.error(t("attendance.failed")),
  });
  function exportCsv() {
    const rows = [[t("attendance.employee"), t("attendance.actualHours"), ...kinds.map(k => t(`attendance.${k}`))]];
    report.forEach(r => rows.push([name(r.member.user_id), (r.minutes / 60).toFixed(2), ...kinds.map(k => String(r.counts[k]))]));
    rows.push([], [t("attendance.employee"), t("attendance.date"), t("attendance.status"), t("attendance.worked")]);
    report.forEach(r => r.days.forEach(d => rows.push([name(r.member.user_id), d.date, t(`attendance.${d.status}`), d.worked ? "1" : "0"])));
    const csv = "\uFEFF" + rows.map(row => row.map(cell => `"${(/^[=+@\-]/.test(cell) ? "'" : "") + cell.replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `attendance-${month}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  if (q.isError) return <p className="text-sm text-destructive">{t("attendance.loadFailed")}</p>;
  const memberSchedules = data?.schedules.filter(s => s.member_id === member?.id).sort((a,b) => b.effective_from.localeCompare(a.effective_from)) ?? [];
  const today = format(new Date(), "yyyy-MM-dd");
  const activeSchedule = memberSchedules.find(s => s.effective_from <= today) ?? memberSchedules[0];
  return <section className="space-y-4">
    {q.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : <>
      {!members.length && <p className="text-sm text-muted-foreground">{t("attendance.noMember")}</p>}
      {!userId && <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-accent text-left"><tr><th className="p-2">{t("attendance.employee")}</th><th className="p-2">{t("attendance.actualHours")}</th>{kinds.map(k => <th className="p-2" key={k}>{t(`attendance.${k}`)}</th>)}</tr></thead><tbody>{report.map(r => <tr key={r.member.id} className="border-b border-border"><td className="p-2"><Button variant="link" className="h-auto p-0" onClick={() => { setSelectedMember(r.member.id); setWorkdays([]); }}>{name(r.member.user_id)}</Button></td><td className="p-2 tabular-nums">{(r.minutes / 60).toFixed(2)}</td>{kinds.map(k => <td className="p-2 tabular-nums" key={k}>{r.counts[k]}</td>)}</tr>)}</tbody></table></div>}
      {member && <Tabs defaultValue={canManage ? (activeSchedule ? "absence" : "workdays") : "month"}>
        <TabsList className="grid w-full grid-cols-3">
          {canManage && <TabsTrigger value="absence">{t("attendance.tabAbsence")}</TabsTrigger>}
          {canManage && <TabsTrigger value="workdays">{t("attendance.workdays")}</TabsTrigger>}
          <TabsTrigger value="month">{t("attendance.tabMonth")}</TabsTrigger>
        </TabsList>

        {canManage && <TabsContent value="absence" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">{t("attendance.absenceHint")}</p>
          <div className="grid gap-1.5"><Label>{t("attendance.kind")}</Label>
            <div className="grid grid-cols-2 gap-2">{kinds.map(k => <Button key={k} type="button" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{t(`attendance.${k}`)}</Button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2"><Label className="grid gap-1">{t("attendance.start")}<Input type="date" value={start} onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></Label><Label className="grid gap-1">{t("attendance.end")}<Input type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} /></Label></div>
          <Label className="grid gap-1">{t("attendance.note")}<Input maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></Label>
          <Button className="w-full" disabled={!start || !end || end < start || mutation.isPending} onClick={() => mutation.mutate("absence")}>{t("attendance.record")}</Button>
          <div className="space-y-2 border-t border-border pt-3"><h4 className="text-sm font-semibold">{t("attendance.history")}</h4>{!(data?.absences.some(a => a.member_id === member.id)) && <p className="text-xs text-muted-foreground">{t("attendance.noRecords")}</p>}{data?.absences.filter(a => a.member_id === member.id).map(a => <div className="border-b border-border py-2 text-sm" key={a.id}><div className="flex flex-wrap justify-between gap-2"><span>{format(parseISO(a.start_date), "dd.MM.yyyy")}{a.end_date !== a.start_date && ` — ${format(parseISO(a.end_date), "dd.MM.yyyy")}`} · {t(`attendance.${a.kind}`)}{a.cancelled && ` · ${t("attendance.cancelled")}`}</span>{!a.cancelled && <Button size="sm" variant="ghost" onClick={() => {setCancelling(a.id); setCorrection("");}}>{t("attendance.cancel")}</Button>}</div>{a.note && <p className="break-words text-xs text-muted-foreground">{a.note}</p>}{cancelling === a.id && <div className="mt-2 flex gap-2"><Input aria-label={t("attendance.correction")} placeholder={t("attendance.correction")} value={correction} onChange={e => setCorrection(e.target.value)} /><Button disabled={!correction.trim() || mutation.isPending} variant="outline" onClick={() => mutation.mutate("cancel")}>{t("common.save")}</Button></div>}</div>)}</div>
        </TabsContent>}

        {canManage && <TabsContent value="workdays" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">{t("attendance.workdaysHint")}</p>
          <div className="grid grid-cols-7 gap-1.5">{weekdayKeys.map((key,i) => { const on = workdays.includes(i+1); return <Button key={key} type="button" variant={on ? "default" : "outline"} className="px-0" onClick={() => setWorkdays(days => on ? days.filter(d => d!==i+1) : [...days,i+1])}>{t(`attendance.${key}`)}</Button>; })}</div>
          <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t("attendance.changeLater")}</summary><Label className="mt-2 grid gap-1">{t("attendance.effective")}<Input type="date" value={effective} onChange={e => setEffective(e.target.value)} /></Label></details>
          <Button className="w-full" disabled={!effective || mutation.isPending} onClick={() => mutation.mutate("schedule")}>{t("attendance.saveWorkdays")}</Button>
          {memberSchedules.length > 0 && <div className="text-xs text-muted-foreground">{memberSchedules.map(s => <div key={s.id}>{t("attendance.effective")} {format(parseISO(s.effective_from), "dd.MM.yyyy")}: {s.weekdays.map(d => t(`attendance.${weekdayKeys[d-1]}`)).join(", ") || t("attendance.off")}</div>)}</div>}
        </TabsContent>}

        <TabsContent value="month" className="space-y-3 pt-2">
          <div className="flex flex-wrap items-end justify-between gap-2"><Label className="grid gap-1">{t("attendance.month")}<Input aria-label={t("attendance.month")} type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></Label><Button size="sm" variant="outline" onClick={exportCsv} disabled={!data}><Download className="mr-1 h-4 w-4" />{t("attendance.export")}</Button></div>
          <div className="text-sm">{t("attendance.actualHours")}: <b>{((current?.minutes ?? 0) / 60).toFixed(2)}</b> · {t("attendance.separate")}: <b>{current?.days.filter(d => kinds.includes(d.status)).length ?? 0}</b></div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">{current?.days.map(d => <div key={d.date} className={`rounded-md border px-2 py-1.5 text-xs ${d.absence ? "border-primary/30 bg-primary/10" : "border-border bg-muted/30"}`}><span className="font-medium">{format(parseISO(d.date), "dd.MM.")}</span><div className={d.status === "missing" ? "text-warning" : "text-muted-foreground"}>{t(`attendance.${d.status}`)}</div>{d.absence && d.worked && <div className="text-warning">{t("attendance.conflict")}</div>}</div>)}</div>
        </TabsContent>
      </Tabs>}
    </>}
  </section>;
}