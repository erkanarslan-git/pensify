import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize, Volume2, VolumeX, Wifi, WifiOff, CalendarPlus, BedDouble, DoorOpen, LogIn, LogOut, Brush, Wrench, Coins, MapPin, Activity, ListChecks, ChartColumn, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTvSnapshot } from "@/lib/tv.functions";
import { newTvEvents, tvDeltas, tvTokenSchema, type TvSnapshot } from "@/lib/tv";
import { BUSINESS_TIME_ZONE, businessTime } from "@/lib/business-time";
import { normalizeChannel } from "@/lib/guest-color";
import brandLogo from "@/assets/pension-highway-logo.png.asset.json";

export const Route = createFileRoute("/tv")({
  head: () => ({ meta: [{ title: "Operasyon TV — Pensify" }, { name: "description", content: "Pensify anonim günlük operasyon özeti." }, { property: "og:title", content: "Operasyon TV — Pensify" }, { property: "og:description", content: "Lokasyon durumları ve anonim günlük operasyon özeti." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }] }),
  component: TvPage,
});

function TvPage() {
  const { t, i18n } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [locationPage, setLocationPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [deltas, setDeltas] = useState<ReturnType<typeof tvDeltas> | null>(null);
  const [changeAt, setChangeAt] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const seen = useRef<string[] | null>(null);
  const previous = useRef<TvSnapshot["totals"] | null>(null);
  const reconnecting = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const read = useServerFn(getTvSnapshot);
  useEffect(() => {
    const parsed = tvTokenSchema.safeParse(window.location.hash.slice(1));
    setToken(parsed.success ? parsed.data : null);
    setLoaded(true);
    setOnline(navigator.onLine);
    const resize = () => setPageSize(window.innerWidth >= 900 ? Math.max(3, Math.min(12, Math.floor((window.innerHeight - 470) / 48))) : 10);
    resize();
    window.addEventListener("resize", resize);
    const lost = () => { setOnline(false); reconnecting.current = true; };
    const restored = () => { setOnline(true); };
    window.addEventListener("offline", lost);
    window.addEventListener("online", restored);
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { window.removeEventListener("resize", resize); window.removeEventListener("offline", lost); window.removeEventListener("online", restored); window.clearInterval(timer); void audio.current?.close(); };
  }, []);
  const query = useQuery({ queryKey: ["tv-snapshot", token], enabled: !!token, queryFn: () => read({ data: { token: token ?? "" } }), refetchInterval: 30000, refetchIntervalInBackground: true, retry: 1, staleTime: 0 });
  useEffect(() => {
    if (query.isError) reconnecting.current = true;
  }, [query.isError]);
  useEffect(() => {
    if (!query.data) return;
    const fresh = newTvEvents(seen.current, query.data.events, reconnecting.current);
    const differences = tvDeltas(previous.current, query.data.totals);
    if (Object.values(differences).some(value => value !== 0)) { setDeltas(differences); setChangeAt(query.data.at); }
    setHighlight(fresh.map(event => event.id));
    seen.current = Array.from(new Set([...(seen.current ?? []), ...query.data.events.map(event => event.id)])).slice(-2000);
    previous.current = query.data.totals;
    reconnecting.current = false;
    if (fresh.length && sound && audio.current?.state === "running") {
      const oscillator = audio.current.createOscillator();
      const gain = audio.current.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.04, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.15);
      oscillator.connect(gain); gain.connect(audio.current.destination);
      oscillator.start(); oscillator.stop(audio.current.currentTime + 0.15);
    }
  }, [query.dataUpdatedAt, query.data, sound]);
  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try { audio.current ??= new AudioContext(); await audio.current.resume(); setSound(true); } catch { setSound(false); }
  }
  if (!loaded || (token && query.isPending)) return <main className="grid min-h-screen place-items-center bg-background text-foreground">{t("common.loading")}</main>;
  if (!token || query.data === null || (!query.data && query.isError)) return <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background p-6 text-center text-foreground"><img src={brandLogo.url} alt="Pension Highway" className="w-48" /><h1 className="text-2xl font-semibold">{t("tv.title")}</h1><p>{t(query.isError ? "tv.unavailable" : "tv.invalid")}</p>{query.isError && <Button onClick={() => query.refetch()}>{t("tv.retry")}</Button>}</main>;
  const data = query.data;
  if (!data) return null;
  const disconnected = !online || query.isError || now - Date.parse(data.at) > 90000;
  const max = Math.max(1, ...data.weekly.flatMap(day => [day.arrivals, day.departures]));
  const time = (value: string) => businessTime(new Date(value));
  const pages = Math.max(1, Math.ceil(data.properties.length / pageSize));
  const currentPage = Math.min(locationPage, pages - 1);
  const properties = data.properties.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const occupancy = data.totals.total ? Math.round(data.totals.occupied / data.totals.total * 1000) / 10 : 0;
  const cards = [
    { key: "created", value: data.totals.created, icon: CalendarPlus, tone: "created" },
    { key: "cleaningOpen", value: data.totals.cleaning, icon: Brush, tone: "cleaning" },
    { key: "maintenanceOpen", value: data.totals.maintenance, icon: Wrench, tone: "maintenance" },
    { key: "occupied", value: `${occupancy}%`, icon: BedDouble, tone: "occupied" },
    { key: "arrivals", value: data.totals.arrivals, icon: LogIn, tone: "arrivals" },
    { key: "departures", value: data.totals.departures, icon: LogOut, tone: "departures" },
    { key: "dueToday", value: data.dues.dueToday, icon: Coins, tone: "dues" },
    { key: "ready", value: data.totals.ready, icon: DoorOpen, tone: "ready" },
  ];
  return <main className="tv-screen bg-background text-foreground">
    <header className="tv-header">
      <div className="flex min-w-0 items-center gap-3"><h1 className="truncate text-2xl font-bold">{data.organization}</h1><span className="tv-header-label border-l border-border pl-3 text-muted-foreground">{t("tv.overview")}</span></div>
      <div className="flex shrink-0 items-center gap-2"><time className="tv-header-date text-sm">{new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeZone: BUSINESS_TIME_ZONE, dateStyle: "medium" }).format(new Date(data.at))} · {time(data.at)}</time><span role="status" className={`tv-connection ${disconnected ? "text-destructive" : "text-success"}`}>{disconnected ? <WifiOff className="h-4 w-4 shrink-0" /> : <Wifi className="h-4 w-4 shrink-0" />}<span>{t(disconnected ? "tv.disconnected" : "tv.live")}</span></span><Button size="icon" variant="ghost" title={t("tv.fullscreen")} aria-label={t("tv.fullscreen")} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }}><Maximize className="h-4 w-4" /></Button></div>
    </header>
    <section className="tv-summary">
      {cards.map(({key, value, icon: Icon, tone}) => <article key={key} className={`tv-summary-card tv-tone-${tone} ${key === "created" ? "brand-tile" : "tv-kpi"}`}>
        <Icon className="tv-card-icon" /><div className="min-w-0"><p className="tv-card-label">{t(`tv.${key}`)}</p><div className="tv-number">{value}</div><p className="tv-card-detail">{key === "occupied" ? `${data.totals.occupied} / ${data.totals.total} ${t("tv.rooms")}` : key in data.totals && deltas?.[key as keyof typeof deltas] ? `${deltas[key as keyof typeof deltas] > 0 ? "↑ +" : "↓ "}${deltas[key as keyof typeof deltas]} · ${changeAt ? time(changeAt) : ""}` : ""}</p></div>
      </article>)}
    </section>
    <div className="tv-middle">
      <section className="tv-location-section min-w-0">
        <div className="tv-band-heading"><h2><MapPin />{t("tv.locationsOverview")}</h2>{pages > 1 && <div className="flex shrink-0 items-center gap-1"><Button size="icon" variant="ghost" aria-label={t("tv.previousPage")} disabled={currentPage === 0} onClick={() => setLocationPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs tabular-nums">{currentPage + 1} / {pages}</span><Button size="icon" variant="ghost" aria-label={t("tv.nextPage")} disabled={currentPage === pages - 1} onClick={() => setLocationPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></div>}</div>
        <div className="tv-table-wrap"><table className="tv-table w-full text-left"><thead><tr>{["location", "total", "occupied", "ready", "cleaning", "maintenance"].map(key => <th key={key}>{t(`tv.${key}`)}</th>)}</tr></thead><tbody>{properties.map(property => <tr key={property.name}><td className="tv-location-name"><span>{property.name}</span><div className="tv-occupancy-track"><div style={{width: `${property.total ? property.occupied / property.total * 100 : 0}%`}} /></div></td>{(["total", "occupied", "ready", "cleaning", "maintenance"] as const).map(key => <td key={key} data-tone={key === "total" ? undefined : key} className={`tv-tone-${key} tabular-nums`}>{property[key]}</td>)}</tr>)}</tbody><tfoot><tr><th>{t("tv.total")}</th>{(["total", "occupied", "ready", "cleaning", "maintenance"] as const).map(key => <td key={key} className="font-semibold tabular-nums">{data.totals[key]}</td>)}</tr></tfoot></table></div>{!data.properties.length && <p className="p-3 text-muted-foreground">{t("tv.noLocations")}</p>}
      </section>
      <aside className="tv-side min-w-0">
        <section className="tv-activity"><div className="tv-band-heading"><h2><Activity />{t("tv.flow")}</h2></div><div className="tv-activity-list">{data.events.slice(0, 5).map(event => <div key={event.id} className={`tv-event ${highlight.includes(event.id) ? "tv-event-new" : ""}`} style={{borderLeftColor: data.colors[normalizeChannel(event.source)]}}><time>{time(event.at)}</time><span>{t(`tv.${event.kind}`)}</span></div>)}{!data.events.length && <p className="p-3 text-sm text-muted-foreground">{t("tv.noEvents")}</p>}</div></section>
        <section className="tv-important"><div className="tv-band-heading"><h2><ListChecks />{t("tv.priorities")}</h2></div><dl>{(["cleaning", "maintenance"] as const).map(key => <div key={key} className={`tv-stat-row tv-tone-${key}`}><dd>{data.totals[key]}</dd><dt>{t(`tv.${key === "cleaning" ? "cleaningOpen" : "maintenanceOpen"}`)}</dt></div>)}<div className="tv-stat-row tv-tone-dues"><dd>{data.dues.overdue}</dd><dt>{t("tv.overdue")}</dt></div></dl></section>
      </aside>
    </div>
    <section className="tv-chart-section"><div className="tv-band-heading"><h2><ChartColumn />{t("tv.week")}</h2><div className="flex gap-3 text-xs"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-tv-arrival" />{t("tv.arrival")}</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-tv-departure" />{t("tv.departure")}</span></div></div><div className="tv-chart">{data.weekly.map(day => <div key={day.day} className="tv-day"><div className="tv-bars">{(["arrivals", "departures"] as const).map((key, index) => <div key={key} className="tv-bar-column"><span>{day[key]}</span><div className={index === 0 ? "bg-tv-arrival" : "bg-tv-departure"} style={{ height: `${day[key] / max * 72}%`, minHeight: day[key] ? 3 : 0 }} /></div>)}</div><p>{new Intl.DateTimeFormat(i18n.resolvedLanguage, {timeZone: BUSINESS_TIME_ZONE, weekday: "short"}).format(new Date(`${day.day}T12:00:00Z`))}</p></div>)}</div></section>
    <footer className="tv-footer"><span>{t("tv.updated")}: {time(data.at)} · Europe/Berlin</span><Button size="sm" variant="ghost" aria-label={t(sound ? "tv.mute" : "tv.sound")} onClick={toggleSound}>{sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{t(sound ? "tv.mute" : "tv.sound")}</Button></footer>
  </main>;
}
