import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Section } from "@/components/app-shell";
import { reservations, rooms, properties, sourceColors } from "@/lib/demo-data";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Pensify" }] }),
  component: CalendarPage,
});

const RANGES = [
  { key: 7, label: "7g" },
  { key: 14, label: "14g" },
  { key: 30, label: "30g" },
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function CalendarPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState(14);
  const [start, setStart] = useState(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 3);
    return d;
  });
  const [propertyId, setPropertyId] = useState<string>("all");
  const [roomQ, setRoomQ] = useState("");
  const [newRes, setNewRes] = useState<{ date: string; propertyId?: string; roomNumber?: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const days: Date[] = useMemo(
    () =>
      Array.from({ length: range }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [start, range],
  );
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = iso(new Date());

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (propertyId !== "all" && r.propertyId !== propertyId) return false;
      if (roomQ && !r.number.toLowerCase().includes(roomQ.toLowerCase())) return false;
      return true;
    });
  }, [propertyId, roomQ]);

  const shift = (n: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + n);
    setStart(d);
  };
  const goToday = () => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 3);
    setStart(d);
  };

  return (
    <AppShell
      title={t("pages.calendar.title")}
      subtitle={t("common.occupancyCalendarSubtitle")}
      actions={
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="px-3 h-9 rounded-md border border-border text-xs font-medium hover:bg-accent inline-flex items-center gap-1"
          >
            <CalendarIcon className="w-3.5 h-3.5" /> Bugün
          </button>
          <button onClick={() => shift(-range)} className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => shift(range)} className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className="px-3 py-2 rounded-md border border-input bg-card text-sm"
        >
          <option value="all">Tüm lokasyonlar</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          value={roomQ}
          onChange={(e) => setRoomQ(e.target.value)}
          placeholder="Oda no…"
          className="px-3 py-2 rounded-md border border-input bg-card text-sm w-32"
        />
        <input
          type="date"
          value={iso(start)}
          onChange={(e) => {
            if (e.target.value) setStart(startOfDay(new Date(e.target.value)));
          }}
          className="px-3 py-2 rounded-md border border-input bg-card text-sm"
        />
        <div className="flex rounded-md border border-input bg-card overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-2 text-xs ${range === r.key ? "bg-accent font-medium" : ""}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <Section title={`${iso(days[0])} — ${iso(days[days.length - 1])} · ${filteredRooms.length} oda`}>
        <div className="overflow-x-auto -m-5">
          <div className="min-w-[900px] px-5">
            <div className="grid" style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(60px, 1fr))` }}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 border-b border-border">Oda</div>
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

              {properties
                .filter((p) => propertyId === "all" || p.id === propertyId)
                .flatMap((p) =>
                  filteredRooms
                    .filter((r) => r.propertyId === p.id)
                    .map((r) => {
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
                          <div
                            key={`${r.id}-${dIso}`}
                            className="border-b border-l border-border h-12 relative group"
                          >
                            {occupant ? (
                              <div
                                className="absolute inset-1 rounded text-[11px] text-white px-1.5 flex items-center font-medium truncate"
                                style={{ background: sourceColors[occupant.source], opacity: 0.92 }}
                                title={`${occupant.guestName} · ${occupant.source}`}
                              >
                                {occupant.guestName.split(" ")[0]}
                              </div>
                            ) : (
                              <button
                                onClick={() =>
                                  setNewRes({ date: dIso, propertyId: p.id, roomNumber: r.number })
                                }
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10 hover:bg-primary/20 grid place-items-center text-primary"
                                title={`Yeni rezervasyon · #${r.number} · ${dIso}`}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
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
          <Link to="/reservations" className="ml-auto text-primary text-xs underline">Tüm rezervasyonlar →</Link>
        </div>
      </Section>

      <NewReservationDialog
        open={!!newRes}
        onOpenChange={(o) => !o && setNewRes(null)}
        initialDate={newRes?.date}
        initialPropertyId={newRes?.propertyId}
        initialRoomNumber={newRes?.roomNumber}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </AppShell>
  );
}
