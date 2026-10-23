import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
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
    const lost = () => { setOnline(false); reconnecting.current = true; };
    const restored = () => { setOnline(true); };
    window.addEventListener("offline", lost);
    window.addEventListener("online", restored);
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => { window.removeEventListener("offline", lost); window.removeEventListener("online", restored); window.clearInterval(timer); void audio.current?.close(); };
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
  return <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
      <div className="flex min-w-0 items-center gap-5"><img src={brandLogo.url} alt="Pension Highway" className="w-32 shrink-0 sm:w-44" /><div className="min-w-0"><h1 className="break-words text-2xl font-semibold sm:text-3xl">{data.organization}</h1><p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeZone: BUSINESS_TIME_ZONE, dateStyle: "full" }).format(new Date(data.at))}</p></div></div>
      <div className="flex items-center gap-2"><span role="status" className={`mr-2 flex max-w-64 items-center gap-2 text-sm ${disconnected ? "text-destructive" : "text-muted-foreground"}`}>{disconnected ? <WifiOff className="h-4 w-4 shrink-0" /> : <Wifi className="h-4 w-4 shrink-0" />}{t(disconnected ? "tv.disconnected" : "tv.live")}</span><Button size="icon" variant="outline" title={t(sound ? "tv.mute" : "tv.sound")} aria-label={t(sound ? "tv.mute" : "tv.sound")} onClick={toggleSound}>{sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Button><Button size="icon" variant="outline" title={t("tv.fullscreen")} aria-label={t("tv.fullscreen")} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }}><Maximize className="h-5 w-5" /></Button></div>
    </header>
    <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {(["created", "occupied", "ready", "arrivals", "departures"] as const).map((key, index) => <article key={key} className={`rounded-lg p-5 ${index === 0 ? "brand-tile" : "border border-border bg-card"}`}><p className="text-sm">{t(`tv.${key}`)}</p><div className="mt-3 text-4xl font-semibold tabular-nums">{data.totals[key]}{key === "occupied" && <span className="ml-2 text-base font-normal opacity-70">/ {data.totals.total}</span>}</div><p className="mt-3 min-h-5 text-xs opacity-75">{deltas?.[key] ? `${deltas[key] > 0 ? "↑ +" : "↓ "}${deltas[key]} · ${changeAt ? time(changeAt) : ""}` : ""}</p></article>)}
    </section>
    <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <section className="min-w-0"><h2 className="mb-4 text-xl font-semibold">{t("tv.location")}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr>{["location", "total", "occupied", "ready", "cleaning", "maintenance"].map(key => <th key={key} className="px-3 py-3 font-medium">{t(`tv.${key}`)}</th>)}</tr></thead><tbody>{data.properties.map((property, index) => <tr key={index} className="border-b border-border"><td className="min-w-40 max-w-72 break-words px-3 py-4 font-medium">{property.name}</td>{(["total", "occupied", "ready", "cleaning", "maintenance"] as const).map(key => <td key={key} className="px-3 py-4 text-lg tabular-nums">{property[key]}</td>)}</tr>)}</tbody></table></div>{!data.properties.length && <p className="py-6 text-muted-foreground">{t("tv.noLocations")}</p>}
      <h2 className="mb-4 mt-8 text-xl font-semibold">{t("tv.week")}</h2><div className="mb-3 flex gap-5 text-xs"><span className="flex items-center gap-2"><span className="h-3 w-3 bg-primary" />{t("tv.arrival")}</span><span className="flex items-center gap-2"><span className="h-3 w-3 bg-info" />{t("tv.departure")}</span></div><div className="grid grid-cols-7 gap-2 border-b border-border pt-6">{data.weekly.map(day => <div key={day.day} className="min-w-0 text-center"><div className="flex h-36 items-end justify-center gap-1">{(["arrivals", "departures"] as const).map((key, index) => <div key={key} className="flex h-full w-5 flex-col justify-end"><span className="mb-1 text-xs tabular-nums">{day[key]}</span><div className={index === 0 ? "bg-primary" : "bg-info"} style={{ height: `${day[key] / max * 100}%`, minHeight: day[key] ? 4 : 0 }} /></div>)}</div><p className="py-3 text-xs">{day.day.slice(8)}.{day.day.slice(5, 7)}</p></div>)}</div>
      </section>
      <aside className="min-w-0"><h2 className="mb-4 text-xl font-semibold">{t("tv.flow")}</h2><div className="max-h-96 space-y-2 overflow-y-auto">{data.events.map(event => <div key={event.id} className={`tv-event flex justify-between gap-3 border-l-4 bg-card px-3 py-3 text-sm ${highlight.includes(event.id) ? "tv-event-new" : ""}`} style={{ borderLeftColor: data.colors[normalizeChannel(event.source)] }}><span>{t(`tv.${event.kind}`)}</span><time className="shrink-0 text-muted-foreground">{time(event.at)}</time></div>)}{!data.events.length && <p className="text-sm text-muted-foreground">{t("tv.noEvents")}</p>}</div><h2 className="mb-4 mt-7 text-xl font-semibold">{t("tv.priorities")}</h2><dl className="space-y-3">{(["cleaning", "maintenance"] as const).map(key => <div key={key} className="flex justify-between border-b border-border pb-3"><dt>{t(`tv.${key}`)}</dt><dd className="text-xl font-semibold tabular-nums">{data.totals[key]}</dd></div>)}</dl><h2 className="mb-4 mt-7 text-xl font-semibold">{t("tv.dues")}</h2><dl className="space-y-3">{(["overdue", "dueToday", "dueWeek"] as const).map(key => <div key={key} className="flex justify-between border-b border-border pb-3"><dt>{t(`tv.${key}`)}</dt><dd className="text-xl tabular-nums">{data.dues[key]}</dd></div>)}</dl></aside>
    </div><footer className="mt-8 border-t border-border pt-4 text-sm text-muted-foreground">{t("tv.updated")}: {time(data.at)} · Europe/Berlin</footer>
  </main>;
}