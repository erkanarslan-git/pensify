import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Kpi, Section, Badge } from "@/components/app-shell";
import {
  rooms, reservations, cleaningTasks, properties, getRoom, getProperty,
  roomStatusMeta, cleaningStatusMeta,
} from "@/lib/demo-data";
import { ArrowUpRight, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — StayFlow" },
      { name: "description", content: "Daily operations overview for your properties." },
    ],
  }),
  component: Dashboard,
});

const weeklyOccupancy = [
  { day: "Mo", rate: 62, clean: 14 },
  { day: "Di", rate: 71, clean: 18 },
  { day: "Mi", rate: 68, clean: 16 },
  { day: "Do", rate: 79, clean: 21 },
  { day: "Fr", rate: 88, clean: 24 },
  { day: "Sa", rate: 94, clean: 28 },
  { day: "So", rate: 82, clean: 22 },
];

function Dashboard() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const totalRooms = rooms.length;
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const available = rooms.filter((r) => r.status === "available").length;
  const cleaningPending = cleaningTasks.filter((t) => t.status === "pending").length;
  const cleaningInProgress = cleaningTasks.filter((t) => t.status === "in_progress").length;
  const completedToday = cleaningTasks.filter((t) => t.status === "completed").length;
  const upcomingCheckouts = reservations
    .filter((r) => r.checkOut >= today)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))
    .slice(0, 6);

  const channelData = Object.entries(
    reservations.reduce<Record<string, number>>((acc, r) => {
      acc[r.source] = (acc[r.source] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const chartColors = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];

  const tooltipStyle = {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    fontSize: "12px",
    boxShadow: "var(--shadow-soft)",
  } as const;

  return (
    <AppShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      actions={
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-soft">
          <Plus className="w-4 h-4" /> {t("common.newReservation")}
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label={t("dashboard.totalRooms")}
          value={totalRooms}
          hint={t("dashboard.properties", { count: properties.length })}
        />
        <Kpi
          label={t("dashboard.occupied")}
          value={occupied}
          hint={t("dashboard.occupancyRate", { rate: Math.round((occupied / totalRooms) * 100) })}
          accent="info"
        />
        <Kpi label={t("dashboard.available")} value={available} accent="success" />
        <Kpi label={t("dashboard.cleaningPending")} value={cleaningPending} accent="warning" />
        <Kpi label={t("dashboard.cleaningInProgress")} value={cleaningInProgress} accent="primary" />
        <Kpi label={t("dashboard.completedToday")} value={completedToday} accent="success" />
        <Kpi
          label={t("dashboard.checkoutsToday")}
          value={rooms.filter((r) => r.status === "checkout_today").length}
          accent="warning"
        />
        <Kpi
          label={t("dashboard.maintenance")}
          value={rooms.filter((r) => r.status === "maintenance").length}
          accent="destructive"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <Section title={t("dashboard.weeklyOccupancy")}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyOccupancy} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="occ" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2.5}
                    fill="url(#occ)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        <Section title={t("dashboard.channelMix")}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  strokeWidth={0}
                >
                  {channelData.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", color: "var(--color-muted-foreground)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2">
          <Section title={t("dashboard.cleaningCompletion")}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyOccupancy} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                  <Bar dataKey="clean" fill="var(--color-chart-2)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        <Section title={t("dashboard.activeCleaningTasks")}>
          <div className="space-y-3">
            {cleaningTasks.slice(0, 6).map((task) => {
              const room = getRoom(task.roomId);
              const prop = getProperty(task.propertyId);
              const meta = cleaningStatusMeta[task.status];
              return (
                <div key={task.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {prop?.name} · {room?.number}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("common.due")} {new Date(task.dueTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{t(`status.${task.status}`)}</Badge>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2">
          <Section
            title={t("dashboard.upcomingCheckouts")}
            action={
              <Link to="/reservations" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                {t("common.viewAll")} <ArrowUpRight className="w-3 h-3" />
              </Link>
            }
          >
            <div className="divide-y divide-border -my-2">
              {upcomingCheckouts.map((r) => {
                const room = getRoom(r.roomId);
                const prop = room ? getProperty(room.propertyId) : null;
                return (
                  <div key={r.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-accent grid place-items-center text-xs font-semibold shrink-0">
                        {r.guestName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.guestName}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {prop?.name} · {room?.number} · {r.source}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{r.checkOut}</div>
                      <div className="text-xs text-muted-foreground">{r.guests} {t("common.guests")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <Section title={t("dashboard.roomStatus")} action={<Link to="/rooms" className="text-xs text-primary hover:underline">{t("common.viewAll")}</Link>}>
          <div className="grid grid-cols-2 gap-2">
            {rooms.slice(0, 10).map((r) => {
              const meta = roomStatusMeta[r.status];
              return (
                <div key={r.id} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">#{r.number}</span>
                    <Badge tone={meta.tone}>{t(`status.${r.status}` as never, { defaultValue: meta.label })}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
