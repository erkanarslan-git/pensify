import { BUSINESS_TIME_ZONE, businessDate, businessDayBounds } from "@/lib/business-time";
import { summarizeRooms } from "@/lib/room-summary";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Section, Badge, useV2Theme } from "@/components/app-shell";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { LoadError } from "@/components/load-error";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useId } from "react";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { normalizeChannel, sourceColor, sourceLabel } from "@/lib/guest-color";
import { formatDateDE } from "@/lib/date-de";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

// Mini trend line inside the colored v2 tiles (contrasting shade of the tile color).
function Spark({ data, stroke }: { data: number[]; stroke: string }) {
  const gid = useId();
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="mt-3 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Panel — Pension Highway" },
      { name: "description", content: "Pansiyonlar, odalar ve temizlik için günlük genel bakış." },
      { property: "og:title", content: "Panel — Pension Highway" },
      { property: "og:description", content: "Pansiyonlar, odalar ve temizlik için günlük genel bakış." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t, i18n } = useTranslation();
  const [newOpen, setNewOpen] = useState(false);
  const v2 = useV2Theme();
  const today = businessDate();

  const { data, refetch, isError } = useQuery({
    queryKey: ["dashboard"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [rooms, tasks, res, props, live] = await Promise.all([
        supabase.from("rooms").select("id,number,status,property:properties(name)").eq("active", true),
        supabase.from("cleaning_tasks").select("id,status,due_at,room:rooms(number),property:properties(name,address)"),
        supabase.from("reservations").select("id,guest_name,channel,check_in,check_out,guests_count,room:rooms(number),property:properties(name)").is("deleted_at", null).gte("check_out", today).not("status", "in", "(cancelled,no_show,checked_out)").order("check_out").limit(3),
        supabase.from("properties").select("id"),
        supabase.from("room_operational_status").select("room_id,status"),
      ]);
      for (const result of [rooms, tasks, res, props, live]) if (result.error) throw result.error;
      const liveMap = new Map((live.data ?? []).map(room => [room.room_id, room.status]));
      return {
        rooms: (rooms.data ?? []).map(room => ({ ...room, status: liveMap.get(room.id) ?? room.status })),
        tasks: (tasks.data ?? []) as any[],
        upcoming: (res.data ?? []) as any[],
        propsCount: (props.data ?? []).length,
      };
    },
  });

  const rooms = data?.rooms ?? [];
  const tasks = data?.tasks ?? [];
  const upcoming = data?.upcoming ?? [];
  const summary = summarizeRooms(rooms);
  const { total: totalRooms, occupied, maintenance, available, cleaning, checkouts: checkoutToday } = summary;
  const completedToday = tasks.filter((t) => t.status === "completed" && (t.due_at ?? "").slice(0, 10) === today).length;

  // Weekly occupancy from reservations (last 7 days incl. today)
  const { data: weekRes } = useQuery({
    queryKey: ["dashboard-week"],
    queryFn: async () => {
      const start = new Date(); start.setDate(start.getDate() - 6);
      const startIso = start.toISOString().slice(0, 10);
      const { data } = await supabase.from("reservations").select("check_in,check_out,channel").is("deleted_at", null).gte("check_out", startIso).not("status", "in", "(cancelled,no_show)");
      return data ?? [];
    },
  });

  const { data: createdToday } = useQuery({
    queryKey: ["dashboard-created-today", today],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { start, end } = businessDayBounds(today);
      const { count, error } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .gte("created_at", start)
        .lt("created_at", end);
      if (error) throw error;
      return count ?? 0;
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
      arr.push({ day: d.toLocaleDateString(i18n.language, { weekday: "short" }), rate: totalRooms ? Math.round((occ / totalRooms) * 100) : 0 });
    }
    return arr;
  }, [weekRes, totalRooms, i18n.language]);

  const channelData = useMemo(() => Object.entries(
    (weekRes ?? []).reduce<Record<string, number>>((acc, r: any) => { const ch = normalizeChannel(r.channel); acc[ch] = (acc[ch] ?? 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value })), [weekRes]);

  // 7-day trend series for the v2 tile sparklines (real counts where history exists).
  const dayIsos = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, k) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - k));
      return d.toISOString().slice(0, 10);
    });
  }, []);
  const occSeries = useMemo(() => dayIsos.map((iso) => {
    const end = new Date(iso); end.setDate(end.getDate() + 1);
    const endIso = end.toISOString().slice(0, 10);
    return (weekRes ?? []).filter((r: any) => r.check_in < endIso && r.check_out > iso).length;
  }), [dayIsos, weekRes]);
  const tileSeries = {
    occupied: occSeries,
    available: occSeries.map((o) => Math.max(totalRooms - o, 0)),
    cleaning: dayIsos.map((iso) => tasks.filter((task) => (task.due_at ?? "").slice(0, 10) === iso && task.status !== "completed").length),
    maintenance: dayIsos.map(() => maintenance),
    checkouts: dayIsos.map((iso) => (weekRes ?? []).filter((r: any) => r.check_out === iso).length),
  };

  const tooltipStyle = { background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-soft)" } as const;

  return (
    <AppShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      actions={v2 ? undefined : (
        <Button onClick={() => setNewOpen(true)} size="sm">
          <Plus className="w-4 h-4" /> {t("common.newReservation")}
        </Button>
      )}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">{t("dashboard.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString(i18n.language, { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Berlin" })}
          </p>
        </div>
        {v2 && (
          <button
            onClick={() => setNewOpen(true)}
            className="btn-action inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-soft transition hover:brightness-105"
          >
            <Plus className="w-4 h-4" /> {t("common.newReservation")}
          </button>
        )}
      </div>

      {isError && <div className="mb-4"><LoadError onRetry={() => refetch()} /></div>}

      {v2 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {[
            { label: t("dashboard.occupied"), value: occupied, hint: t("dashboard.occupancyRate", { rate: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0 }), to: "/reservations", search: {}, cls: "brand-tile", series: tileSeries.occupied, stroke: "#a8c6fa" },
            { label: t("dashboard.available"), value: available, hint: t("dashboard.properties", { count: data?.propsCount ?? 0 }), to: "/rooms", search: { status: "available" }, cls: "tile-success", series: tileSeries.available, stroke: "#14532d" },
            { label: t("nav.cleaning"), value: cleaning, hint: t("nav.rooms"), to: "/cleaning", search: {}, cls: "tile-warning", series: tileSeries.cleaning, stroke: "#7c4a03" },
            { label: t("dashboard.maintenance"), value: maintenance, hint: t("nav.rooms"), to: "/rooms", search: { status: "maintenance" }, cls: "tile-destructive", series: tileSeries.maintenance, stroke: "#7f1d1d" },
            { label: t("dashboard.checkoutsToday"), value: checkoutToday, hint: `${completedToday} ${t("dashboard.completedToday")}`, to: "/reservations", search: {}, cls: "tile-ocean", series: tileSeries.checkouts, stroke: "#132b50" },
          ].map((k) => (
            <Link key={k.label} to={k.to as any} search={k.search as any}
              className={`group flex min-w-0 flex-col rounded-2xl p-5 shadow-soft transition hover:shadow-elevated hover:brightness-110 ${k.cls}`}>
              <span className="text-sm font-medium opacity-95">{k.label}</span>
              <div className="mt-3 text-4xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-1 truncate text-xs opacity-85">{k.hint}</div>
              <Spark data={k.series} stroke={k.stroke} />
            </Link>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/reservations" className="brand-tile group relative overflow-hidden rounded-2xl p-5 shadow-elevated transition hover:brightness-110">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-90">{t("dashboard.occupied")}</span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-card text-primary"><ArrowUpRight className="h-4 w-4" /></span>
          </div>
          <div className="mt-4 text-5xl font-semibold tabular-nums">{occupied}</div>
          <div className="mt-2 text-sm opacity-85">{t("dashboard.occupancyRate", { rate: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0 })}</div>
        </Link>
        {[
          { label: t("dashboard.available"), value: available, hint: t("dashboard.properties", { count: data?.propsCount ?? 0 }), to: "/rooms", search: { status: "available" }, tile: "tile-success" },
          "split",
          { label: t("dashboard.checkoutsToday"), value: checkoutToday, hint: `${completedToday} ${t("dashboard.completedToday")}`, to: "/reservations", search: {}, marker: "v2-checkout" },
        ].map((k) => typeof k === "string" ? (
          <div key="split" className="grid grid-cols-2 gap-3">
            {[
              { label: t("nav.cleaning"), value: cleaning, hint: t("nav.rooms"), to: "/cleaning", search: {}, tile: "tile-warning" },
              { label: t("dashboard.maintenance"), value: maintenance, hint: t("nav.rooms"), to: "/rooms", search: { status: "maintenance" }, tile: "tile-destructive" },
            ].map((s) => (
              <Link key={s.label} to={s.to as any} search={s.search as any}
                className={`group flex min-w-0 flex-col rounded-2xl p-4 shadow-soft transition hover:shadow-elevated hover:brightness-110 ${s.tile}`}>
                <span className="text-sm font-medium opacity-95">{s.label}</span>
                <div className="mt-3 text-4xl font-semibold tabular-nums">{s.value}</div>
                <div className="mt-2 truncate text-xs opacity-85">{s.hint}</div>
              </Link>
            ))}
          </div>
        ) : (
          <Link key={k.label} to={k.to as any} search={k.search as any}
            className={`group rounded-2xl p-5 shadow-soft transition hover:shadow-elevated hover:brightness-110 ${(k as any).marker ?? ""} ${k.tile ?? "border border-border bg-card"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{k.label}</span>
              <span className={`grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition ${k.tile ? "border border-current/40 text-current group-hover:bg-card group-hover:text-card-foreground" : "border border-border group-hover:bg-primary group-hover:text-primary-foreground"}`}><ArrowUpRight className="h-4 w-4" /></span>
            </div>
            <div className={`mt-4 text-5xl font-semibold tabular-nums ${k.tile ? "text-white" : "text-foreground"}`}>{k.value}</div>
            <div className={`mt-2 text-sm ${k.tile ? "opacity-85" : "text-muted-foreground"}`}>{k.hint}</div>
          </Link>
        ))}
      </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { label: t("dashboard.totalRooms"), value: totalRooms, to: "/rooms", search: {} },
          { label: t("dashboard.completedToday"), value: completedToday, to: "/cleaning", search: {} },
          { label: t("dashboard.createdToday"), value: createdToday ?? 0, to: "/reservations", search: { created: "today" } },
        ].map((k) => (
          <Link key={k.label} to={k.to as any} search={k.search as any}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            {k.label} <span className="font-semibold tabular-nums text-primary">{k.value}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6 [&>*]:min-w-0">
        <Section title={t("dashboard.activeCleaningTasks")}>
          <div className="divide-y divide-border">
            {tasks.filter((t) => t.status !== "completed").slice(0, 6).map((task) => (
              <Link key={task.id} to="/cleaning" className="flex min-w-0 flex-col items-start gap-3 py-4 first:pt-0 last:pb-0 transition hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-primary [overflow-wrap:anywhere]">{t("resv.thRoom")} {task.room?.number}</div>
                  <div className="mt-1 text-xs text-foreground [overflow-wrap:anywhere]">{task.property?.address || task.property?.name || "—"}</div>
                  <div className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{t("common.due")} {task.due_at ? new Date(task.due_at).toLocaleString(i18n.language, { timeZone: BUSINESS_TIME_ZONE }) : "—"}</div>
                </div>
                <Badge tone={task.status === "problem" ? "destructive" : task.status === "in_progress" ? "primary" : "warning"}>{t(`status.${task.status}`)}</Badge>
              </Link>
            ))}
            {tasks.filter((t) => t.status !== "completed").length === 0 && (
              <div className="text-sm text-muted-foreground">{t("dashboard.noActiveTasks")}</div>
            )}
          </div>
        </Section>

        <div className="lg:col-span-2">
          <Section title={t("dashboard.weeklyOccupancy")}>
            <div className="h-full min-h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)" }} />
                  <Bar dataKey="rate" radius={[8, 8, 8, 8]} maxBarSize={56}>
                    {weekly.map((_, i) => (<Cell key={i} fill={i === weekly.length - 1 ? "var(--color-chart-2)" : "var(--color-chart-1)"} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 [&>*]:min-w-0">
        <Section title={t("dashboard.channelMix")}>
          <div className="h-full min-h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4} strokeWidth={0}>
                  {channelData.map((c, i) => (<Cell key={i} fill={sourceColor(c.name)} />))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v as any, sourceLabel(String(n), (k) => t(k))]} />
                <Legend verticalAlign="bottom" height={36} iconSize={8} formatter={(v) => sourceLabel(String(v), (k) => t(k))} wrapperStyle={{ fontSize: 11, color: "var(--color-muted-foreground)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="lg:col-span-2">
          <Section
            title={t("dashboard.upcomingCheckouts")}
            action={<Link to="/reservations" className="text-xs text-primary hover:underline inline-flex shrink-0 items-center gap-0.5">{t("common.viewAll")} <ArrowUpRight className="w-3 h-3" /></Link>}
          >
            <div className="divide-y divide-border -my-2">
              {upcoming.map((r) => (
                <div key={r.id} className="flex min-w-0 flex-col items-start gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-accent grid place-items-center text-xs font-semibold shrink-0">
                      {(r.guest_name ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium [overflow-wrap:anywhere]">{r.guest_name}</div>
                      <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]" title={r.property?.name}>
                        {r.property?.name}<span className="block sm:inline"> · {t("resv.thRoom")} {r.room?.number} · {sourceLabel(r.channel, (k) => t(k))}</span>
                      </div>
                    </div>
                  </div>
                  <div className="pl-12 sm:pl-0 sm:shrink-0 sm:text-right">
                    <div className="text-sm font-medium">{formatDateDE(r.check_out)}</div>
                    <div className="text-xs text-muted-foreground">{r.guests_count} {t("common.guests")}</div>
                  </div>
                </div>
              ))}
              {upcoming.length === 0 && (
                <div className="py-6 text-sm text-muted-foreground">{t("pages.notifications.noCheckouts")}</div>
              )}
            </div>
          </Section>
        </div>
      </div>

      <NewReservationDialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) refetch(); }} />
    </AppShell>
  );
}
