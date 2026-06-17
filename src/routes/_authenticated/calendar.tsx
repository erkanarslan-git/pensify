import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section } from "@/components/app-shell";
import { reservations, rooms, properties, getRoom, sourceColors } from "@/lib/demo-data";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Pensify" }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const { t } = useTranslation();
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const days: Date[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = iso(new Date());

  const shift = (n: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + n);
    setStart(d);
  };

  return (
    <AppShell title={t("pages.calendar.title")} subtitle={t("common.occupancyCalendarSubtitle")}
      actions={
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-7)} className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => shift(7)} className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <Section title={`${iso(days[0])} — ${iso(days[days.length - 1])}`}>
        <div className="overflow-x-auto -m-5">
          <div className="min-w-[900px] px-5">
            <div className="grid" style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(60px, 1fr))` }}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 border-b border-border">Room</div>
              {days.map((d) => {
                const isToday = iso(d) === today;
                return (
                  <div key={iso(d)} className={`text-center py-3 border-b border-border ${isToday ? "bg-primary/5" : ""}`}>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                    <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
                  </div>
                );
              })}

              {properties.flatMap((p) =>
                rooms.filter((r) => r.propertyId === p.id).map((r) => {
                  const cells: React.ReactNode[] = [];
                  cells.push(
                    <div key={`${r.id}-label`} className="py-3 pr-3 border-b border-border text-sm">
                      <div className="font-medium truncate">#{r.number}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{p.name}</div>
                    </div>,
                  );
                  days.forEach((d) => {
                    const dIso = iso(d);
                    const occupant = reservations.find(
                      (res) => res.roomId === r.id && res.checkIn <= dIso && res.checkOut > dIso,
                    );
                    cells.push(
                      <div key={`${r.id}-${dIso}`} className="border-b border-l border-border h-12 relative">
                        {occupant && (
                          <div
                            className="absolute inset-1 rounded text-[11px] text-white px-1.5 flex items-center font-medium truncate"
                            style={{ background: sourceColors[occupant.source], opacity: 0.92 }}
                            title={`${occupant.guestName} · ${occupant.source}`}
                          >
                            {occupant.guestName.split(" ")[0]}
                          </div>
                        )}
                      </div>,
                    );
                  });
                  return cells;
                }),
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-5 text-xs">
          {Object.entries(sourceColors).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ background: v }} />
              <span className="text-muted-foreground">{k}</span>
            </div>
          ))}
        </div>
      </Section>
    </AppShell>
  );
}
