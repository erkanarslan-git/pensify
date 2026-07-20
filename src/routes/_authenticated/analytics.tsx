import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Kpi } from "@/components/app-shell";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceColor, sourceLabel } from "@/lib/guest-color";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Pensify" }] }),
  component: AnalyticsPage,
});

type RangeKey = "7" | "30" | "90" | "365";
const RANGES: { key: RangeKey; label: string; days: number; bucket: "day" | "week" | "month" }[] = [
  { key: "7", label: "7 Tage", days: 7, bucket: "day" },
  { key: "30", label: "30 Tage", days: 30, bucket: "day" },
  { key: "90", label: "90 Tage", days: 90, bucket: "week" },
  { key: "365", label: "12 Monate", days: 365, bucket: "month" },
];

function AnalyticsPage() {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState<RangeKey>("30");
  const range = RANGES.find((r) => r.key === rangeKey)!;

  const startDate = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - range.days);
    return d.toISOString().slice(0, 10);
  }, [range.days]);

  const { data } = useQuery({
    queryKey: ["analytics", rangeKey],
    queryFn: async () => {
      const [rooms, tasks, res] = await Promise.all([
        supabase.from("rooms").select("id,status"),
        supabase.from("cleaning_tasks").select("id,status").gte("created_at", startDate),
        supabase.from("reservations").select("id,check_in,check_out,channel,revenue").gte("check_in", startDate).neq("status", "cancelled"),
      ]);
      return {
        rooms: rooms.data ?? [],
        tasks: tasks.data ?? [],
        reservations: (res.data ?? []) as { id: string; check_in: string; check_out: string; channel: string; revenue: number }[],
      };
    },
  });

  const rooms = data?.rooms ?? [];
  const tasks = data?.tasks ?? [];
  const reservations = data?.reservations ?? [];

  const occupied = rooms.filter((r: any) => r.status === "occupied" || r.status === "checkout_today").length;
  const occupancyRate = rooms.length ? Math.round((occupied / rooms.length) * 100) : 0;
  const completion = tasks.length ? Math.round((tasks.filter((t: any) => t.status === "completed").length / tasks.length) * 100) : 0;
  const revenue = reservations.reduce((s, r) => s + Number(r.revenue ?? 0), 0);

  const bySource = Object.entries(
    reservations.reduce<Record<string, number>>((acc, r) => {
      acc[r.channel] = (acc[r.channel] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const series = useMemo(() => {
    const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (range.bucket === "day") {
      for (let i = range.days - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const end = new Date(d); end.setDate(end.getDate() + 1);
        buckets.push({ key: d.toISOString().slice(0, 10), label: range.days <= 7 ? d.toLocaleDateString(undefined, { weekday: "short" }) : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }), start: d, end });
      }
    } else if (range.bucket === "week") {
      const weeks = Math.ceil(range.days / 7);
      for (let i = weeks - 1; i >= 0; i--) {
        const end = new Date(now); end.setDate(end.getDate() - i * 7 + 1);
        const start = new Date(end); start.setDate(start.getDate() - 7);
        buckets.push({ key: start.toISOString().slice(0, 10), label: start.toLocaleDateString(undefined, { day: "2-digit", month: "short" }), start, end });
      }
    } else {
      const months = Math.ceil(range.days / 30);
      for (let i = months - 1; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        buckets.push({ key: start.toISOString().slice(0, 7), label: start.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), start, end });
      }
    }
    return buckets.map((b) => {
      const startIso = b.start.toISOString().slice(0, 10);
      const endIso = b.end.toISOString().slice(0, 10);
      const occ = reservations.filter((r) => r.check_in < endIso && r.check_out > startIso).length;
      const rev = reservations
        .filter((r) => r.check_in >= startIso && r.check_in < endIso)
        .reduce((s, r) => s + Number(r.revenue ?? 0), 0);
      return { day: b.label, occupancy: Math.round((occ / Math.max(rooms.length, 1)) * 100), revenue: rev };
    });
  }, [range, reservations, rooms.length]);

  return (
    <AppShell
      title={t("pages.analytics.title")}
      subtitle="Betriebsübersicht"
      actions={
        <div className="inline-flex rounded-md border border-input bg-card overflow-hidden">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRangeKey(r.key)}
              className={`px-3 py-2 text-sm ${rangeKey === r.key ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"}`}>
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Auslastung" value={`${occupancyRate}%`} accent="primary" />
        <Kpi label="Reinigung erledigt" value={`${completion}%`} accent="success" />
        <Kpi label="Buchungen" value={reservations.length} accent="info" />
        <Kpi label="Umsatz" value={`€${revenue.toLocaleString()}`} accent="warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <Section title={`Belegung — ${range.label}`}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} unit="%" />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="occupancy" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Buchungen nach Kanal">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={bySource} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                {bySource.map((s) => (<Cell key={s.name} fill={sourceColor(s.name)} />))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => sourceLabel(String(v))} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [v as any, sourceLabel(String(n))]} />
            </PieChart>
          </ResponsiveContainer>
        </Section>

        <Section title={`Umsatz — ${range.label}`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Reinigung im Zeitraum">
          <div className="flex items-center gap-6">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--primary)" strokeWidth="3"
                  strokeDasharray={`${completion} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-2xl font-semibold">{completion}%</div>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">Gesamt</span><span className="font-medium">{tasks.length}</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">Erledigt</span><span className="font-medium text-success">{tasks.filter((t: any) => t.status === "completed").length}</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">Läuft</span><span className="font-medium text-primary">{tasks.filter((t: any) => t.status === "in_progress").length}</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">Offen</span><span className="font-medium text-warning">{tasks.filter((t: any) => t.status === "pending").length}</span></div>
            </div>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
