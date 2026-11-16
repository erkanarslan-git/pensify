import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadOccupancyOverview } from "@/lib/occupancy-overview.functions";
import { addDays, dailyOccupancy, heatLevel, type DayOccupancy } from "@/lib/occupancy-overview";
import { displayLocale } from "@/i18n/legacy-ui";

export type OverviewMode = "month" | "year";

const TEXT = {
  de: { free: "frei", in: "An", out: "Ab", avg: "Ø Auslastung", fullDays: "ausgebucht", legendLow: "leer", legendHigh: "voll", loading: "Wird geladen…", error: "Konnte nicht geladen werden." },
  en: { free: "free", in: "In", out: "Out", avg: "Avg. occupancy", fullDays: "fully booked", legendLow: "empty", legendHigh: "full", loading: "Loading…", error: "Could not be loaded." },
  tr: { free: "boş", in: "Giriş", out: "Çıkış", avg: "Ort. doluluk", fullDays: "tam dolu gün", legendLow: "boş", legendHigh: "dolu", loading: "Yükleniyor…", error: "Yüklenemedi." },
};

const HEAT = [
  "var(--card)",
  "color-mix(in oklab, var(--primary) 15%, var(--card))",
  "color-mix(in oklab, var(--primary) 35%, var(--card))",
  "color-mix(in oklab, var(--primary) 60%, var(--card))",
  "var(--primary)",
];
const heatText = (lvl: number) => (lvl >= 3 ? "text-primary-foreground" : "text-foreground");

function monthStart(iso: string) { return `${iso.slice(0, 7)}-01`; }
function shiftMonth(iso: string, n: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
function daysInMonth(iso: string) { return Number(addDays(shiftMonth(iso, 1), -1).slice(8, 10)); }
function weekdayMon0(iso: string) { return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; }

export function OccupancyOverview({ mode, propertyId, today, onPickDay }: { mode: OverviewMode; propertyId: string; today: string; onPickDay: (iso: string) => void }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language?.slice(0, 2) ?? "de") as keyof typeof TEXT;
  const tx = TEXT[lang] ?? TEXT.de;
  const locale = displayLocale();
  const [anchor, setAnchor] = useState(() => monthStart(today));
  const start = mode === "month" ? anchor : anchor;
  const span = mode === "month" ? daysInMonth(anchor) : Math.round((Date.parse(`${shiftMonth(anchor, 12)}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86_400_000);
  const fetchOverview = useServerFn(loadOccupancyOverview);
  const [data, setData] = useState<DayOccupancy[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null); setFailed(false);
    fetchOverview({ data: { start, days: span, propertyId: propertyId === "first" ? "all" : propertyId } })
      .then((r) => { if (live) setData(dailyOccupancy(start, span, r.totalRooms, r.reservations)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [start, span, propertyId]);

  const summary = useMemo(() => {
    if (!data?.length) return null;
    const avg = data.reduce((s, d) => s + d.rate, 0) / data.length;
    return { avg: Math.round(avg * 100), full: data.filter((d) => d.rate >= 1).length };
  }, [data]);

  const monthName = (iso: string, long = true) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }));
  const step = mode === "month" ? 1 : 12;
  const title = mode === "month" ? monthName(anchor) : `${monthName(anchor, false)} – ${monthName(shiftMonth(anchor, 11), false)}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => setAnchor(shiftMonth(anchor, -step))} className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent"><ChevronLeft className="w-4 h-4" /></button>
        <h2 className="text-base font-semibold capitalize min-w-[180px] text-center">{title}</h2>
        <button onClick={() => setAnchor(shiftMonth(anchor, step))} className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent"><ChevronRight className="w-4 h-4" /></button>
        {summary && (
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-border px-3 py-1">{tx.avg}: <b>{summary.avg}%</b></span>
            <span className="rounded-full border border-border px-3 py-1"><b>{summary.full}</b> {tx.fullDays}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          {tx.legendLow}
          {HEAT.map((c, i) => <span key={i} className="w-4 h-4 rounded border border-border" style={{ background: c }} />)}
          {tx.legendHigh}
        </div>
      </div>

      {failed && <p className="text-sm text-destructive">{tx.error}</p>}
      {!failed && !data && <p className="text-sm text-muted-foreground">{tx.loading}</p>}

      {data && mode === "month" && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekdays.map((w) => <div key={w} className="text-[11px] uppercase text-muted-foreground text-center pb-1">{w}</div>)}
          {Array.from({ length: weekdayMon0(anchor) }, (_, i) => <div key={`e${i}`} />)}
          {data.map((d) => {
            const lvl = heatLevel(d.rate);
            return (
              <button key={d.date} onClick={() => onPickDay(d.date)}
                className={`min-w-0 rounded-lg border p-2 text-left min-h-[84px] hover:ring-2 hover:ring-primary/40 ${heatText(lvl)} ${d.date === today ? "border-primary ring-1 ring-primary" : "border-border"}`}
                style={{ background: HEAT[lvl] }}>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-semibold">{Number(d.date.slice(8))}</span>
                  <span className="text-xs font-semibold">{Math.round(d.rate * 100)}%</span>
                </div>
                <div className="text-[11px] mt-1">{d.free} {tx.free}</div>
                <div className="text-[10px] opacity-80 truncate">{tx.in} {d.arrivals} · {tx.out} {d.departures}</div>
              </button>
            );
          })}
        </div>
      )}

      {data && mode === "year" && (
        <div className="overflow-x-auto">
          <div className="min-w-[760px] space-y-1">
            <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: "110px repeat(31, minmax(0, 1fr)) 48px" }}>
              <span />
              {Array.from({ length: 31 }, (_, i) => <span key={i} className="text-[10px] text-center text-muted-foreground">{i + 1}</span>)}
              <span className="text-[10px] text-right text-muted-foreground">Ø</span>
            </div>
            {Array.from({ length: 12 }, (_, m) => {
              const ms = shiftMonth(anchor, m);
              const rows = data.filter((d) => d.date.startsWith(ms.slice(0, 7)));
              const avg = rows.length ? Math.round((rows.reduce((s, d) => s + d.rate, 0) / rows.length) * 100) : 0;
              return (
                <div key={ms} className="grid items-center gap-[3px]" style={{ gridTemplateColumns: "110px repeat(31, minmax(0, 1fr)) 48px" }}>
                  <button onClick={() => onPickDay(ms)} className="text-xs text-left capitalize truncate hover:text-primary">{monthName(ms, false)}</button>
                  {Array.from({ length: 31 }, (_, i) => {
                    const d = rows[i];
                    if (!d) return <span key={i} />;
                    const lvl = heatLevel(d.rate);
                    const weekend = weekdayMon0(d.date) >= 5;
                    return (
                      <button key={i} onClick={() => onPickDay(d.date)}
                        title={`${d.date} · ${Math.round(d.rate * 100)}% · ${d.free} ${tx.free}`}
                        className={`h-6 rounded-[4px] border hover:ring-2 hover:ring-primary/50 ${d.date === today ? "border-primary border-2" : weekend ? "border-foreground/30" : "border-border"}`}
                        style={{ background: HEAT[lvl] }} />
                    );
                  })}
                  <span className="text-xs font-semibold text-right">{avg}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
