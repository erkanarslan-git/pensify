import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import {
  reservations, getRoom, getProperty, sourceColors, properties, cities,
  type ReservationSource,
} from "@/lib/demo-data";
import { useState, useMemo } from "react";
import { Search, Plus, Table as TableIcon, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";

export const Route = createFileRoute("/_authenticated/reservations")({
  head: () => ({ meta: [{ title: "Reservations — Pensify" }] }),
  component: ReservationsPage,
});

const sources: ReservationSource[] = ["Airbnb", "Booking.com", "Website", "Phone", "Walk-in"];

function ReservationsPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<"table" | "property">("table");
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<ReservationSource | "all">("all");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(
    () =>
      reservations.filter((r) => {
        if (src !== "all" && r.source !== src) return false;
        if (q && !r.guestName.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [q, src],
  );

  return (
    <AppShell title={t("pages.reservations.title")} subtitle={t("pages.reservations.subtitle", { count: reservations.length })}
      actions={
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Neu
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search guests…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={src}
          onChange={(e) => setSrc(e.target.value as ReservationSource | "all")}
          className="px-3 py-2 rounded-md border border-input bg-card text-sm"
        >
          <option value="all">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex rounded-md border border-input bg-card overflow-hidden">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${view === "table" ? "bg-accent" : ""}`}
          >
            <TableIcon className="w-4 h-4" /> Table
          </button>
          <button
            onClick={() => setView("property")}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${view === "property" ? "bg-accent" : ""}`}
          >
            <Building2 className="w-4 h-4" /> By property
          </button>
        </div>
      </div>

      {view === "table" ? (
        <Section title={`${filtered.length} reservations`}>
          <div className="overflow-x-auto -m-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-3 font-medium">Guest</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Room</th>
                  <th className="px-5 py-3 font-medium">Check-in</th>
                  <th className="px-5 py-3 font-medium">Check-out</th>
                  <th className="px-5 py-3 font-medium text-right">Guests</th>
                  <th className="px-5 py-3 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const room = getRoom(r.roomId);
                  const prop = room ? getProperty(room.propertyId) : null;
                  return (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3 font-medium">{r.guestName}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: sourceColors[r.source] }} />
                          {r.source}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{prop?.name}</td>
                      <td className="px-5 py-3">#{room?.number}</td>
                      <td className="px-5 py-3">{r.checkIn}</td>
                      <td className="px-5 py-3">{r.checkOut}</td>
                      <td className="px-5 py-3 text-right">{r.guests}</td>
                      <td className="px-5 py-3 text-right font-medium">€{r.revenue}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <div className="space-y-4">
          {cities.map((c) => (
            <div key={c.id}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">{c.name}</div>
              <div className="grid md:grid-cols-2 gap-4">
                {properties.filter((p) => p.cityId === c.id).map((p) => {
                  const list = filtered.filter((r) => {
                    const room = getRoom(r.roomId);
                    return room?.propertyId === p.id;
                  });
                  return (
                    <Section key={p.id} title={`${p.name} · ${list.length}`}>
                      {list.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No reservations</div>
                      ) : (
                        <div className="space-y-2">
                          {list.slice(0, 5).map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-sm">
                              <div>
                                <div className="font-medium">{r.guestName}</div>
                                <div className="text-xs text-muted-foreground">Room #{getRoom(r.roomId)?.number} · {r.checkIn} → {r.checkOut}</div>
                              </div>
                              <Badge tone="muted">{r.source}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
