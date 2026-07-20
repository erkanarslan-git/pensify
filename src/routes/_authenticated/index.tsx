import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Kpi, Section, Badge } from "@/components/app-shell";
import { ArrowUpRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { sourceColor, sourceLabel } from "@/lib/guest-color";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Pensify" },
      { name: "description", content: "Tägliche Übersicht über Pensionen, Zimmer und Reinigung." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const [newOpen, setNewOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const { data, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [rooms, tasks, res, props] = await Promise.all([
        supabase.from("rooms").select("id,number,status,property:properties(name)"),
        supabase.from("cleaning_tasks").select("id,status,due_at,room:rooms(number),property:properties(name)"),
        supabase.from("reservations").select("id,guest_name,channel,check_in,check_out,guests_count,room:rooms(number),property:properties(name)").gte("check_out", today).neq("status", "cancelled").order("check_out").limit(6),
        supabase.from("properties").select("id"),
      ]);
      return {
        rooms: (rooms.data ?? []) as any[],
        tasks: (tasks.data ?? []) as any[],
        upcoming: (res.data ?? []) as any[],
        propsCount: (props.data ?? []).length,
      };
    },
  });

  const rooms = data?.rooms ?? [];
  const tasks = data?.tasks ?? [];
  const upcoming = data?.upcoming ?? [];
  const totalRooms = rooms.length;
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const available = rooms.filter((r) => r.status === "available").length;
  const cleaningPending = tasks.filter((t) => t.status === "pending").length;
  const cleaningInProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completedToday = tasks.filter((t) => t.status === "completed" && (t.due_at ?? "").slice(0, 10) === today).length;
  const checkoutToday = rooms.filter((r) => r.status === "checkout_today").length;
  const maintenance = rooms.filter((r) => r.status === "maintenance").length;

  // Weekly occupancy from reservations (last 7 days incl. today)
  const { data: weekRes } = useQuery({
    queryKey: ["dashboard-week"],
    queryFn: async () => {
      const start = new Date(); start.setDate(start.getDate() - 6);
      const startIso = start.toISOString().slice(0, 10);
      const { data } = await supabase.from("reservations").select("check_in,check_out,channel").gte("check_out", startIso).neq("status", "cancelled");
      return data ?? [];
    },
  });

  const weekly = useMemo(() => {
    const arr: { day: string; rate: number }[] = [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const end = new Date(d); end.setDate(end.getDate() + 1);
      const endIso = end.toISOString().slice(0, 10);
      const occ = (weekRes ?? []).filter((r: any) => r.check_in < endIso && r.check_out > iso).length;
      arr.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), rate: totalRooms ? Math.round((occ / totalRooms) * 100) : 0 });
    }
    return arr;
  }, [weekRes, totalRooms]);

  const channelData = useMemo(() => Object.entries(
    (weekRes ?? []).reduce<Record<string, number>>((acc, r: any) => { acc[r.channel] = (acc[r.channel] ?? 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value })), [weekRes]);

  const tooltipStyle = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-soft)" } as const;

  return (
    <AppShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      actions={
        <button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-soft">
          <Plus className="w-4 h-4" /> {t("common.newReservation")}
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={t("dashboard.totalRooms")} value={totalRooms} hint={t("dashboard.properties", { count: data?.propsCount ?? 0 })} />
        <Kpi label={t("dashboard.occupied")} value={occupied} hint={t("dashboard.occupancyRate", { rate: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0 })} accent="info" />
        <Kpi label={t("dashboard.available")} value={available} accent="success" />
        <Kpi label={t("dashboard.cleaningPending")} value={cleaningPending} accent="warning" />
        <Kpi label={t("dashboard.cleaningInProgress")} value={cleaningInProgress} accent="primary" />
        <Kpi label={t("dashboard.completedToday")} value={completedToday} accent="success" />
        <Kpi label={t("dashboard.checkoutsToday")} value={checkoutToday} accent="warning" />
        <Kpi label={t("dashboard.maintenance")} value={maintenance} accent="destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Section title={t("dashboard.activeCleaningTasks")}>
          <div className="space-y-3">
            {tasks.filter((t) => t.status !== "completed").slice(0, 6).map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{task.property?.name} · Zimmer {task.room?.number}</div>
                  <div className="text-xs text-muted-foreground">Fällig {task.due_at ? new Date(task.due_at).toLocaleString() : "—"}</div>
                </div>
                <Badge tone={task.status === "problem" ? "destructive" : task.status === "in_progress" ? "primary" : "warning"}>{task.status}</Badge>
              </div>
            ))}
            {tasks.filter((t) => t.status !== "completed").length === 0 && (
              <div className="text-sm text-muted-foreground">Keine aktiven Aufgaben</div>
            )}
          </div>
        </Section>

        <div className="lg:col-span-2">
          <Section title={t("dashboard.weeklyOccupancy")}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  <Area type="monotone" dataKey="rate" stroke="var(--color-chart-1)" strokeWidth={2.5} fill="url(#occ)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Section title={t("dashboard.channelMix")}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4} strokeWidth={0}>
                  {channelData.map((c, i) => (<Cell key={i} fill={sourceColor(c.name)} />))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v as any, sourceLabel(String(n))]} />
                <Legend verticalAlign="bottom" height={36} iconSize={8} formatter={(v) => sourceLabel(String(v))} wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="lg:col-span-2">
          <Section
            title={t("dashboard.upcomingCheckouts")}
            action={<Link to="/reservations" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">{t("common.viewAll")} <ArrowUpRight className="w-3 h-3" /></Link>}
          >
            <div className="divide-y divide-border -my-2">
              {upcoming.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-accent grid place-items-center text-xs font-semibold shrink-0">
                      {(r.guest_name ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.guest_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.property?.name} · Zimmer {r.room?.number} · {sourceLabel(r.channel)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{r.check_out}</div>
                    <div className="text-xs text-muted-foreground">{r.guests_count} {t("common.guests")}</div>
                  </div>
                </div>
              ))}
              {upcoming.length === 0 && (
                <div className="py-6 text-sm text-muted-foreground">Keine anstehenden Check-outs</div>
              )}
            </div>
          </Section>
        </div>
      </div>

      <NewReservationDialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) refetch(); }} />
    </AppShell>
  );
}
