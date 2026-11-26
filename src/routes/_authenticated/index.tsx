import { BUSINESS_TIME_ZONE, businessDate, businessDayBounds } from "@/lib/business-time";
import { addDaysIso, parseLocalIso } from "@/lib/calendar-date";
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
import { propertyCards, todayMovements, type TodayReservation } from "@/lib/dashboard-today";
import { TodayGuests, PropertyOverview, useDashTxt } from "@/components/dashboard-today";
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

const UP_TXT = {
  tr: { in: "Yaklaşan girişler", none: "Yaklaşan giriş yok", paid: "Ödendi", partial: "Kısmi ödendi", open: "Ödenmedi" },
  de: { in: "Kommende Check-ins", none: "Keine kommenden Anreisen", paid: "Bezahlt", partial: "Teilbezahlt", open: "Offen" },
  en: { in: "Upcoming check-ins", none: "No upcoming check-ins", paid: "Paid", partial: "Partly paid", open: "Unpaid" },
};
type PayState = "paid" | "partial" | "open";

async function loadPayStates(rows: { id: string; organization_id: string }[]): Promise<Record<string, PayState>> {
  const out: Record<string, PayState> = {};
  const byOrg = new Map<string, string[]>();
  for (const r of rows) byOrg.set(r.organization_id, [...(byOrg.get(r.organization_id) ?? []), r.id]);
  for (const [org, ids] of byOrg) {
    const { data } = await supabase.rpc("reservation_payment_states", { _org: org, _reservation_ids: ids });
    for (const st of (data ?? []) as { reservation_id: string; state: PayState }[]) out[st.reservation_id] = st.state;
  }
  return out;
}

function UpcomingList({ title, rows, dateKey, focus, payStates, empty }: { title: string; rows: any[]; dateKey: "check_in" | "check_out"; focus: "arrivals" | "departures"; payStates: Record<string, PayState>; empty: string }) {
  const { t, i18n } = useTranslation();
  const l = i18n.language.slice(0, 2);
  const tx = UP_TXT[(l === "tr" || l === "en" ? l : "de") as keyof typeof UP_TXT];
  return (
    <Section title={title} action={<Link to="/reservations" search={{ focus }} className="text-xs text-primary hover:underline inline-flex shrink-0 items-center gap-0.5">{t("common.viewAll")} <ArrowUpRight className="w-3 h-3" /></Link>}>
      <div className="divide-y divide-border -my-2">
        {rows.map((r) => {
          const st = payStates[r.id];
          const unpaid = st === "open";
          return (
            <Link key={r.id} to="/reservations" search={{ q: r.guest_name ?? "" }} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-accent/50">
              <div className={`w-9 h-9 rounded-full grid place-items-center text-xs font-semibold shrink-0 ${unpaid ? "bg-destructive/15 text-destructive" : "bg-accent"}`}>
                {(r.guest_name ?? "").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium [overflow-wrap:anywhere] ${unpaid ? "text-destructive" : ""}`}>{r.guest_name}</div>
                <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.property?.name} · {t("resv.thRoom")} {r.room?.number}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-medium">{formatDateDE(r[dateKey])}</div>
                {st && <Badge tone={st === "paid" ? "success" : st === "partial" ? "warning" : "destructive"}>{tx[st]}</Badge>}
              </div>
            </Link>
          );
        })}
        {rows.length === 0 && <div className="py-6 text-sm text-muted-foreground">{empty}</div>}
      </div>
    </Section>
  );
}

function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = ((l) => (l === "tr" || l === "en" ? l : "de"))(i18n.language.slice(0, 2)) as keyof typeof UP_TXT;
  const [newOpen, setNewOpen] = useState(false);
  const v2 = useV2Theme();
  const today = businessDate();

  const { data, refetch, isError } = useQuery({
    queryKey: ["dashboard"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [rooms, tasks, res, props, live, arr] = await Promise.all([
        supabase.from("rooms").select("id,number,status,property_id,property:properties(name)").eq("active", true),
        supabase.from("cleaning_tasks").select("id,status,due_at,room:rooms(number),property:properties(name,address)"),
        supabase.from("reservations").select("id,organization_id,guest_name,channel,check_in,check_out,guests_count,room:rooms(number),property:properties(name)").is("deleted_at", null).eq("long_stay", false).gte("check_out", today).not("status", "in", "(cancelled,no_show,checked_out)").order("check_out").limit(5),
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("room_operational_status").select("room_id,status"),
        supabase.from("reservations").select("id,organization_id,guest_name,channel,check_in,check_out,guests_count,room:rooms(number),property:properties(name)").is("deleted_at", null).gte("check_in", today).not("status", "in", "(cancelled,no_show,checked_out,checked_in)").order("check_in").limit(5),
      ]);
      for (const result of [rooms, tasks, res, props, live, arr]) if (result.error) throw result.error;
      const liveMap = new Map((live.data ?? []).map(room => [room.room_id, room.status]));
      return {
        rooms: (rooms.data ?? []).map(room => ({ ...room, status: liveMap.get(room.id) ?? room.status })),
        tasks: (tasks.data ?? []) as any[],
        upcoming: (res.data ?? []) as any[],
        arrivalsSoon: (arr.data ?? []) as any[],
        payStates: await loadPayStates([...(res.data ?? []), ...(arr.data ?? [])] as any[]),
        propsCount: (props.data ?? []).length,
        props: (props.data ?? []) as { id: string; name: string }[],
      };
    },
  });

  const rooms = data?.rooms ?? [];
  const tasks = data?.tasks ?? [];
  const upcoming = data?.upcoming ?? [];
  const arrivalsSoon = data?.arrivalsSoon ?? [];
  const payStates = data?.payStates ?? {};
  const summary = summarizeRooms(rooms);
  const { total: totalRooms, occupied, maintenance, available, cleaning } = summary;
  const dt = useDashTxt();
  const { data: todayRes } = useQuery({
    queryKey: ["dashboard-today-res", today],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("reservations")
        .select("id,guest_name,check_in,check_out,long_stay,property_id,status,room:rooms(number),property:properties(name)")
        .is("deleted_at", null).lte("check_in", today).gte("check_out", today).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as TodayReservation[];
    },
  });
  const moves = useMemo(() => todayMovements(todayRes ?? [], today), [todayRes, today]);
  const cards = useMemo(() => propertyCards(data?.props ?? [], rooms as any, todayRes ?? [], today), [data?.props, rooms, todayRes, today]);
  const completedToday = tasks.filter((t) => t.status === "completed" && (t.due_at ?? "").slice(0, 10) === today).length;

  // Weekly occupancy from reservations (last 7 days incl. today)
  const { data: weekRes } = useQuery({
    queryKey: ["dashboard-week"],
    queryFn: async () => {
      const startIso = addDaysIso(businessDate(), -6);
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
    const todayIso = businessDate();
    for (let i = 6; i >= 0; i--) {
      const iso = addDaysIso(todayIso, -i);
      const d = parseLocalIso(iso);
      const endIso = addDaysIso(iso, 1);
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
    const todayIso = businessDate();
    return Array.from({ length: 7 }, (_, k) => addDaysIso(todayIso, -(6 - k)));
  }, []);
  const occSeries = useMemo(() => dayIsos.map((iso) => {
    const endIso = addDaysIso(iso, 1);
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: t("dashboard.occupied"), value: occupied, hint: t("dashboard.occupancyRate", { rate: totalRooms ? Math.round((occupied / totalRooms) * 100) : 0 }), to: "/reservations", search: {}, cls: "brand-tile", series: tileSeries.occupied, stroke: "#a8c6fa" },
            { label: t("dashboard.available"), value: available, hint: t("dashboard.properties", { count: data?.propsCount ?? 0 }), to: "/rooms", search: { status: "available" }, cls: "tile-success", series: tileSeries.available, stroke: "#14532d" },
            { label: t("nav.cleaning"), value: cleaning, hint: t("nav.rooms"), to: "/cleaning", search: {}, cls: "tile-warning", series: tileSeries.cleaning, stroke: "#7c4a03" },
            { label: t("dashboard.maintenance"), value: maintenance, hint: t("nav.rooms"), to: "/rooms", search: { status: "maintenance" }, cls: "tile-destructive", series: tileSeries.maintenance, stroke: "#7f1d1d" },
          ].map((k) => (
            <Link key={k.label} to={k.to as any} search={k.search as any}
              className={`group flex min-w-0 flex-col rounded-2xl p-5 shadow-soft transition hover:shadow-elevated hover:brightness-110 ${k.cls}`}>
              <span className="text-sm font-medium opacity-95">{k.label}</span>
              <div className="mt-3 text-4xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-1 truncate text-xs opacity-85">{k.hint}</div>
              <Spark data={k.series} stroke={k.stroke} />
            </Link>
          ))}
          <div className="grid min-w-0 grid-cols-2 gap-3 col-span-2 sm:col-span-3 xl:col-span-2">
            {[
              { label: dt.in, value: moves.arrivals.length, focus: "arrivals" as const },
              { label: dt.out, value: moves.departures.length, focus: "departures" as const },
            ].map((s) => (
              <Link key={s.focus} to="/reservations" search={{ focus: s.focus }}
                className="tile-ocean group flex min-w-0 flex-col rounded-2xl p-4 shadow-soft transition hover:shadow-elevated hover:brightness-110">
                <span className="truncate text-sm font-medium opacity-95">{s.label}</span>
                <div className="mt-3 text-4xl font-semibold tabular-nums">{s.value}</div>
              </Link>
            ))}
          </div>
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
          "moves",
        ].map((k) => k === "moves" ? (
          <div key="moves" className="grid grid-cols-2 gap-3">
            {[
              { label: dt.in, value: moves.arrivals.length, focus: "arrivals" as const },
              { label: dt.out, value: moves.departures.length, focus: "departures" as const },
            ].map((s) => (
              <Link key={s.focus} to="/reservations" search={{ focus: s.focus }}
                className="v2-checkout group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:shadow-elevated">
                <span className="truncate text-sm font-medium">{s.label}</span>
                <div className="mt-3 text-4xl font-semibold tabular-nums text-foreground">{s.value}</div>
                <div className="mt-2 truncate text-xs text-muted-foreground">{dt.all}</div>
              </Link>
            ))}
          </div>
        ) : typeof k === "string" ? (
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

      <TodayGuests arrivals={moves.arrivals} departures={moves.departures} />
      <PropertyOverview cards={cards} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6 [&>*]:min-w-0">
        <Section title={t("dashboard.activeCleaningTasks")} action={<Link to="/cleaning" className="text-xs text-primary hover:underline inline-flex shrink-0 items-center gap-0.5">{t("common.viewAll")} <ArrowUpRight className="w-3 h-3" /></Link>}>
          <div className="divide-y divide-border">
            {tasks.filter((t) => t.status !== "completed" && (t.due_at ?? "").slice(0, 10) <= today).sort((a, b) => (b.due_at ?? "").localeCompare(a.due_at ?? "")).slice(0, 3).map((task) => (
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

        <div className="lg:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <UpcomingList title={UP_TXT[lang].in} rows={arrivalsSoon} dateKey="check_in" focus="arrivals" payStates={payStates} empty={UP_TXT[lang].none} />
          <UpcomingList title={t("dashboard.upcomingCheckouts")} rows={upcoming} dateKey="check_out" focus="departures" payStates={payStates} empty={t("pages.notifications.noCheckouts")} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <Section title={t("dashboard.weeklyOccupancy")}>
            <div className="h-full min-h-56">
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

        <Section title={t("dashboard.channelMix")}>
          <div className="h-full min-h-56">
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
      </div>

      <NewReservationDialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) refetch(); }} />
    </AppShell>
  );
}
