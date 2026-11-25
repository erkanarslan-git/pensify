import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, LogIn, LogOut } from "lucide-react";
import { Section } from "@/components/app-shell";
import type { PropertyCard, TodayReservation } from "@/lib/dashboard-today";

const TXT = {
  tr: { in: "Bugün giriş", out: "Bugün çıkış", all: "Hepsini gör", none: "Bugün kimse yok", room: "Oda", props: "Pansiyonlar", total: "Oda", occupied: "Dolu", free: "Boş", cleaning: "Temizlik", maintenance: "Bakım", longStay: "Uzun dönem", arrivals: "Giriş", departures: "Çıkış", calendar: "Takvimde aç" },
  de: { in: "Anreisen heute", out: "Abreisen heute", all: "Alle anzeigen", none: "Heute niemand", room: "Zimmer", props: "Unterkünfte", total: "Zimmer", occupied: "Belegt", free: "Frei", cleaning: "Reinigung", maintenance: "Wartung", longStay: "Dauergäste", arrivals: "Anreise", departures: "Abreise", calendar: "Im Kalender öffnen" },
  en: { in: "Check-ins today", out: "Check-outs today", all: "View all", none: "Nobody today", room: "Room", props: "Properties", total: "Rooms", occupied: "Occupied", free: "Free", cleaning: "Cleaning", maintenance: "Repair", longStay: "Long-stay", arrivals: "Check-in", departures: "Check-out", calendar: "Open in calendar" },
};
export function useDashTxt() {
  const { i18n } = useTranslation();
  const l = i18n.language.slice(0, 2);
  return TXT[(l === "tr" || l === "en" ? l : "de") as keyof typeof TXT];
}

function GuestList({ title, icon, rows, focus }: { title: string; icon: React.ReactNode; rows: TodayReservation[]; focus: "arrivals" | "departures" }) {
  const c = useDashTxt();
  return (
    <Section title={`${title} · ${rows.length}`} action={<Link to="/reservations" search={{ focus }} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline">{c.all} <ArrowUpRight className="h-3 w-3" /></Link>}>
      <div className="-my-2 max-h-72 divide-y divide-border overflow-y-auto">
        {rows.map((r) => (
          <Link key={r.id} to="/reservations" search={{ focus, q: r.guest_name ?? "" }} className="flex min-w-0 items-center gap-3 py-2.5 hover:bg-accent/50">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-muted-foreground">{icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.guest_name || "—"}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.property?.name} · {c.room} {r.room?.number ?? "—"}</span>
            </span>
          </Link>
        ))}
        {rows.length === 0 && <div className="py-4 text-sm text-muted-foreground">{c.none}</div>}
      </div>
    </Section>
  );
}

export function TodayGuests({ arrivals, departures }: { arrivals: TodayReservation[]; departures: TodayReservation[] }) {
  const c = useDashTxt();
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
      <GuestList title={c.in} icon={<LogIn className="h-4 w-4" />} rows={arrivals} focus="arrivals" />
      <GuestList title={c.out} icon={<LogOut className="h-4 w-4" />} rows={departures} focus="departures" />
    </div>
  );
}

export function PropertyOverview({ cards }: { cards: PropertyCard[] }) {
  const c = useDashTxt();
  const lang = useTranslation().i18n.language.slice(0, 2);
  if (!cards.length) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">{c.props}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((p) => {
          const stat = (label: string, value: number, tone: string, to: React.ReactElement) => ({ label, value, tone, link: to });
          const box = (label: string, value: number, tone: string) => (
            <span className={`flex h-full min-w-0 flex-col justify-between rounded-xl px-2 py-2 ${tone}`}>
              <span className="text-[10px] leading-tight opacity-90 [overflow-wrap:anywhere]">{label}</span>
              <span className="text-xl font-semibold tabular-nums">{value}</span>
            </span>
          );
          const items = [
            stat(c.total, p.total, "bg-muted text-foreground", <Link to="/rooms" search={{ property: p.id }}>{box(c.total, p.total, "bg-muted text-foreground")}</Link>),
            stat(c.occupied, p.occupied, "", <Link to="/rooms" search={{ property: p.id, status: "occupied" }}>{box(c.occupied, p.occupied, "bg-primary/15 text-primary")}</Link>),
            stat(c.free, p.available, "", <Link to="/rooms" search={{ property: p.id, status: "available" }}>{box(c.free, p.available, "bg-success/15 text-success-foreground dark:text-success")}</Link>),
            stat(c.cleaning, p.cleaning, "", <Link to="/rooms" search={{ property: p.id, status: "cleaning_required" }}>{box(c.cleaning, p.cleaning, "bg-warning/15 text-warning-foreground dark:text-warning")}</Link>),
            stat(c.maintenance, p.maintenance, "", <Link to="/rooms" search={{ property: p.id, status: "maintenance" }}>{box(c.maintenance, p.maintenance, "bg-destructive/15 text-destructive")}</Link>),
            stat(c.longStay, p.longStay, "", <Link to="/reservations" search={{ property: p.id, long: "1" }}>{box(c.longStay, p.longStay, "bg-info/15 text-info-foreground dark:text-info")}</Link>),
            stat(c.arrivals, p.arrivals, "", <Link to="/reservations" search={{ property: p.id, focus: "arrivals" }}>{box(c.arrivals, p.arrivals, "bg-accent text-foreground")}</Link>),
            stat(c.departures, p.departures, "", <Link to="/reservations" search={{ property: p.id, focus: "departures" }}>{box(c.departures, p.departures, "bg-accent text-foreground")}</Link>),
          ];
          return (
            <div key={p.id} className={`flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-soft ${p.total > 0 && p.rate >= 100 ? "border-success/60 bg-success/5" : p.total > 0 && p.occupied === 0 ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
              <Link to="/calendar" search={{ property: p.id }} title={c.calendar} className="group mb-3 flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold group-hover:text-primary">{p.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">{lang === "tr" ? `%${p.rate}` : `${p.rate}%`} <ArrowUpRight className="h-3 w-3" /></span>
              </Link>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${p.rate >= 100 ? "bg-success" : p.occupied === 0 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${p.rate}%` }} /></div>
              <div className="grid grid-cols-4 gap-1.5 [&_a>span]:transition [&_a:hover>span]:ring-1 [&_a:hover>span]:ring-border">
                {items.map((i) => <span key={i.label} className="contents">{i.link}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
