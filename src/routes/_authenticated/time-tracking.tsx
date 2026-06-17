import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, MapPin, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import i18n from "@/i18n";

export const Route = createFileRoute("/_authenticated/time-tracking")({
  head: () => ({ meta: [{ title: `${i18n.t("nav.timeTracking")} — Pensify` }] }),
  component: TimeTrackingPage,
});

type Entry = {
  id: string;
  cleaner_id: string;
  property_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  cleaners: { full_name: string; hourly_rate: number | null } | null;
  properties: { name: string } | null;
};

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function presetRange(p: string): [string, string] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (p === "today") return [isoDate(today), isoDate(today)];
  if (p === "week") {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    return [isoDate(d), isoDate(today)];
  }
  if (p === "month") {
    const d = new Date(today); d.setDate(1);
    return [isoDate(d), isoDate(today)];
  }
  if (p === "year") {
    const d = new Date(today); d.setMonth(0, 1);
    return [isoDate(d), isoDate(today)];
  }
  return [isoDate(today), isoDate(today)];
}

function TimeTrackingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [preset, setPreset] = useState("week");
  const [from, setFrom] = useState(() => presetRange("week")[0]);
  const [to, setTo] = useState(() => presetRange("week")[1]);
  const [cleanerFilter, setCleanerFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const setPresetRange = (p: string) => {
    setPreset(p);
    const [f, tt] = presetRange(p);
    setFrom(f); setTo(tt);
  };

  const { data: cleaners = [] } = useQuery({
    queryKey: ["cleaners-list"],
    queryFn: async () => {
      const { data } = await supabase.from("cleaners").select("id, full_name, hourly_rate").order("full_name");
      return data ?? [];
    },
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["properties-list-tt"],
    queryFn: async () => {
      const { data } = await supabase.from("properties").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["time-entries", from, to, cleanerFilter, propertyFilter, unpaidOnly],
    queryFn: async () => {
      let q = supabase
        .from("time_entries")
        .select(
          "id, cleaner_id, property_id, clock_in_at, clock_out_at, break_minutes, status, paid_at, paid_amount, clock_in_lat, clock_in_lng, cleaners(full_name, hourly_rate), properties(name)",
        )
        .gte("clock_in_at", `${from}T00:00:00`)
        .lte("clock_in_at", `${to}T23:59:59`)
        .order("clock_in_at", { ascending: false });
      if (cleanerFilter !== "all") q = q.eq("cleaner_id", cleanerFilter);
      if (propertyFilter !== "all") q = q.eq("property_id", propertyFilter);
      if (unpaidOnly) q = q.is("paid_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const summary = useMemo(() => {
    const byCleaner = new Map<string, { name: string; minutes: number; rate: number; entries: number; amount: number }>();
    let totalMin = 0;
    for (const e of entries) {
      if (!e.clock_out_at) continue;
      const min = Math.max(0, Math.round((new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime()) / 60000) - (e.break_minutes ?? 0));
      totalMin += min;
      const rate = e.cleaners?.hourly_rate ?? 0;
      const cur = byCleaner.get(e.cleaner_id) ?? { name: e.cleaners?.full_name ?? "?", minutes: 0, rate, entries: 0, amount: 0 };
      cur.minutes += min;
      cur.entries += 1;
      cur.amount = (cur.minutes / 60) * cur.rate;
      byCleaner.set(e.cleaner_id, cur);
    }
    return { totalMin, byCleaner: Array.from(byCleaner.entries()) };
  }, [entries]);

  const markPaid = useMutation({
    mutationFn: async (entry: Entry) => {
      const min = entry.clock_out_at
        ? Math.max(0, Math.round((new Date(entry.clock_out_at).getTime() - new Date(entry.clock_in_at).getTime()) / 60000) - (entry.break_minutes ?? 0))
        : 0;
      const amount = ((min / 60) * (entry.cleaners?.hourly_rate ?? 0)).toFixed(2);
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("time_entries")
        .update({
          paid_at: new Date().toISOString(),
          paid_by: user.user?.id ?? null,
          paid_amount: Number(amount),
          payment_period_start: from,
          payment_period_end: to,
        })
        .eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("timeTracking.markedPaid"));
      qc.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    const rows = [["Cleaner", "Property", "Start", "End", "Minutes", "Break (min)", "Status", "Paid", "Amount"]];
    for (const e of entries) {
      const min = e.clock_out_at
        ? Math.max(0, Math.round((new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime()) / 60000) - (e.break_minutes ?? 0))
        : 0;
      rows.push([
        e.cleaners?.full_name ?? "",
        e.properties?.name ?? "",
        new Date(e.clock_in_at).toISOString(),
        e.clock_out_at ?? "",
        String(min),
        String(e.break_minutes ?? 0),
        e.status,
        e.paid_at ?? "",
        e.paid_amount?.toString() ?? "",
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `time-tracking-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title={t("nav.timeTracking")}
      subtitle={t("timeTracking.adminSubtitle")}
      actions={
        <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
          <Download className="w-4 h-4" /> CSV
        </Button>
      }
    >
      <div className="space-y-4">
        <Section title={t("timeTracking.filters")}>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            <div className="col-span-2 md:col-span-2">
              <Label className="text-xs">{t("timeTracking.range")}</Label>
              <Select value={preset} onValueChange={setPresetRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">{t("common.today")}</SelectItem>
                  <SelectItem value="week">{t("timeTracking.lastWeek")}</SelectItem>
                  <SelectItem value="month">{t("timeTracking.thisMonth")}</SelectItem>
                  <SelectItem value="year">{t("timeTracking.thisYear")}</SelectItem>
                  <SelectItem value="custom">{t("timeTracking.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("timeTracking.from")}</Label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} />
            </div>
            <div>
              <Label className="text-xs">{t("timeTracking.to")}</Label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} />
            </div>
            <div>
              <Label className="text-xs">{t("nav.cleaners")}</Label>
              <Select value={cleanerFilter} onValueChange={setCleanerFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {cleaners.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("nav.properties")}</Label>
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="col-span-2 md:col-span-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
              {t("timeTracking.unpaidOnly")}
            </label>
          </div>
        </Section>

        <Section title={t("timeTracking.summary")}>
          <div className="mb-3 flex flex-wrap gap-3">
            <Badge tone="info"><Clock className="w-3 h-3" /> {Math.floor(summary.totalMin / 60)}h {summary.totalMin % 60}m {t("timeTracking.totalTime")}</Badge>
            <Badge tone="muted">{entries.length} {t("timeTracking.entries")}</Badge>
          </div>
          {summary.byCleaner.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
          ) : (
            <div className="overflow-x-auto -m-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-5 py-2 font-medium">{t("nav.cleaners")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.shifts")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.hours")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.rate")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCleaner.map(([id, s]) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-5 py-2 font-medium">{s.name}</td>
                      <td className="px-5 py-2">{s.entries}</td>
                      <td className="px-5 py-2">{Math.floor(s.minutes / 60)}h {s.minutes % 60}m</td>
                      <td className="px-5 py-2">{s.rate ? `€${s.rate.toFixed(2)}/h` : "—"}</td>
                      <td className="px-5 py-2 font-semibold">{s.rate ? `€${s.amount.toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title={t("timeTracking.shiftDetails")}>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("common.noResults")}</p>
          ) : (
            <div className="overflow-x-auto -m-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="px-5 py-2 font-medium">{t("nav.cleaners")}</th>
                    <th className="px-5 py-2 font-medium">{t("nav.properties")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.start")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.end")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.duration")}</th>
                    <th className="px-5 py-2 font-medium">{t("timeTracking.geo")}</th>
                    <th className="px-5 py-2 font-medium">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const min = e.clock_out_at
                      ? Math.max(0, Math.round((new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime()) / 60000) - (e.break_minutes ?? 0))
                      : 0;
                    return (
                      <tr key={e.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-2">{e.cleaners?.full_name}</td>
                        <td className="px-5 py-2">{e.properties?.name}</td>
                        <td className="px-5 py-2 text-xs whitespace-nowrap">{new Date(e.clock_in_at).toLocaleString()}</td>
                        <td className="px-5 py-2 text-xs whitespace-nowrap">
                          {e.clock_out_at ? new Date(e.clock_out_at).toLocaleString() : <Badge tone="warning">{t("timeTracking.active")}</Badge>}
                        </td>
                        <td className="px-5 py-2">{e.clock_out_at ? `${Math.floor(min / 60)}h ${min % 60}m` : "—"}</td>
                        <td className="px-5 py-2">
                          {e.clock_in_lat != null && e.clock_in_lng != null ? (
                            <a className="text-primary hover:underline inline-flex items-center gap-1" href={`https://maps.google.com/?q=${e.clock_in_lat},${e.clock_in_lng}`} target="_blank" rel="noreferrer">
                              <MapPin className="w-3 h-3" />
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-2">
                          {e.paid_at ? (
                            <Badge tone="success"><CheckCircle2 className="w-3 h-3" /> €{e.paid_amount?.toFixed(2)}</Badge>
                          ) : e.clock_out_at ? (
                            <Button size="sm" variant="outline" onClick={() => markPaid.mutate(e)}>{t("timeTracking.markPaid")}</Button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
