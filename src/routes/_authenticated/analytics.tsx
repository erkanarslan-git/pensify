import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Kpi } from "@/components/app-shell";
import { reservations, rooms, cleaningTasks, sourceColors } from "@/lib/demo-data";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Pensify" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { t } = useTranslation();
  const occupied = rooms.filter((r) => r.status === "occupied" || r.status === "checkout_today").length;
  const occupancyRate = Math.round((occupied / rooms.length) * 100);
  const completion = cleaningTasks.length > 0
    ? Math.round((cleaningTasks.filter((t) => t.status === "completed").length / cleaningTasks.length) * 100)
    : 0;
  const revenue = reservations.reduce((s, r) => s + r.revenue, 0);

  const bySource = Object.entries(
    reservations.reduce<Record<string, number>>((acc, r) => {
      acc[r.source] = (acc[r.source] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const iso = d.toISOString().slice(0, 10);
    const occ = reservations.filter((r) => r.checkIn <= iso && r.checkOut > iso).length;
    return {
      day: d.toLocaleDateString(undefined, { weekday: "short" }),
      occupancy: Math.round((occ / rooms.length) * 100),
      revenue: reservations.filter((r) => r.checkIn === iso).reduce((s, r) => s + r.revenue, 0),
    };
  });

  return (
    <AppShell title={t("pages.analytics.title")} subtitle="Operational performance">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Occupancy rate" value={`${occupancyRate}%`} accent="primary" />
        <Kpi label="Cleaning completion" value={`${completion}%`} accent="success" />
        <Kpi label="Reservations" value={reservations.length} accent="info" />
        <Kpi label="Revenue (demo)" value={`€${revenue.toLocaleString()}`} accent="warning" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <Section title="Occupancy — last 7 days">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={last7}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} unit="%" />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="occupancy" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Reservations by source">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={bySource} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                {bySource.map((s) => (
                  <Cell key={s.name} fill={(sourceColors as Record<string, string>)[s.name]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Revenue (demo) — last 7 days">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={last7}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Cleaning completion rate">
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
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">Total</span><span className="font-medium">{cleaningTasks.length}</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">Completed</span><span className="font-medium text-success">{cleaningTasks.filter((t) => t.status === "completed").length}</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">In progress</span><span className="font-medium text-primary">{cleaningTasks.filter((t) => t.status === "in_progress").length}</span></div>
              <div className="flex justify-between gap-6"><span className="text-muted-foreground">Pending</span><span className="font-medium text-warning">{cleaningTasks.filter((t) => t.status === "pending").length}</span></div>
            </div>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
