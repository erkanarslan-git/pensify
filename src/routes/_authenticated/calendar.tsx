import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Section } from "@/components/app-shell";
import {
  reservations as demoReservations,
  rooms as demoRooms,
  properties as demoProperties,
} from "@/lib/demo-data";
import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Pencil, Sparkles, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { supabase } from "@/integrations/supabase/client";
import { guestColor, sourceColor, sourceLabel } from "@/lib/guest-color";

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

interface UnifiedProperty { id: string; name: string }
interface UnifiedRoom { id: string; number: string; propertyId: string; floor?: number | null; needsCleaning?: boolean; issue?: string | null }
interface UnifiedRes {
  id: string;
  roomId: string;
  guestName: string;
  source: string;
  checkIn: string;
  checkOut: string;
  realId: string | null; // supabase id if real
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
  const [guestQ, setGuestQ] = useState("");
  const [newRes, setNewRes] = useState<{ date: string; propertyId?: string; roomNumber?: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Real data
  const [realProperties, setRealProperties] = useState<UnifiedProperty[]>([]);
  const [realRooms, setRealRooms] = useState<UnifiedRoom[]>([]);
  const [realReservations, setRealReservations] = useState<UnifiedRes[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: props }, { data: rms }, { data: res }, { data: tasks }] = await Promise.all([
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("rooms").select("id,number,property_id,floor").order("floor", { ascending: true, nullsFirst: true }).order("number"),
        supabase.from("reservations").select("id,room_id,guest_name,channel,check_in,check_out,status").neq("status", "cancelled"),
        supabase.from("cleaning_tasks").select("room_id,status,notes").in("status", ["pending", "in_progress", "problem"]),
      ]);
      setRealProperties((props ?? []) as UnifiedProperty[]);
      const cleaningByRoom = new Map<string, { needsCleaning: boolean; issue: string | null }>();
      for (const ct of (tasks ?? []) as { room_id: string; status: string; notes: string | null }[]) {
        const entry = cleaningByRoom.get(ct.room_id) ?? { needsCleaning: false, issue: null };
        entry.needsCleaning = true;
        if (ct.status === "problem") entry.issue = ct.notes ?? "Sorun bildirildi";
        cleaningByRoom.set(ct.room_id, entry);
      }
      const mappedRooms: UnifiedRoom[] = ((rms ?? []) as { id: string; number: string; property_id: string; floor: number | null }[]).map((r) => ({
        id: r.id, number: r.number, propertyId: r.property_id, floor: r.floor,
        needsCleaning: cleaningByRoom.get(r.id)?.needsCleaning ?? false,
        issue: cleaningByRoom.get(r.id)?.issue ?? null,
      }));
      setRealRooms(mappedRooms);
      setRealReservations(((res ?? []) as { id: string; room_id: string; guest_name: string; channel: string; check_in: string; check_out: string }[])
        .map((r) => ({
          id: r.id, realId: r.id, roomId: r.room_id, guestName: r.guest_name,
          source: r.channel, checkIn: r.check_in, checkOut: r.check_out,
        })));
    })();
  }, [refreshKey]);

  // Pick supabase data when available, otherwise demo fallback
  const useReal = realRooms.length > 0;
  const properties: UnifiedProperty[] = useReal ? realProperties : demoProperties.map((p) => ({ id: p.id, name: p.name }));
  const rooms: UnifiedRoom[] = useReal ? realRooms : demoRooms.map((r) => ({ id: r.id, number: r.number, propertyId: r.propertyId }));
  const reservations: UnifiedRes[] = useReal
    ? realReservations
    : demoReservations.map((r) => ({ id: r.id, realId: null, roomId: r.roomId, guestName: r.guestName, source: r.source, checkIn: r.checkIn, checkOut: r.checkOut }));

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
  }, [propertyId, roomQ, rooms]);

  const filteredReservations = useMemo(() => {
    const q = guestQ.trim().toLowerCase();
    if (!q) return reservations;
    return reservations.filter((r) =>
      r.guestName.toLowerCase().includes(q) || (r.realId ?? r.id).toLowerCase().includes(q),
    );
  }, [guestQ, reservations]);



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
            <div className="grid" style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(60px, 1fr))` }}>
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
                        <div key={`${r.id}-label`} className="py-3 pr-3 border-b border-border text-sm flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate flex items-center gap-1.5">
                              {r.floor != null && (
                                <span
                                  title={r.floor === 0 ? "Erdgeschoss" : `${r.floor}. Obergeschoss`}
                                  className="inline-flex items-center justify-center min-w-[28px] h-[18px] px-1 rounded text-[10px] font-semibold bg-accent text-accent-foreground"
                                >
                                  {r.floor === 0 ? "EG" : `${r.floor}.OG`}
                                </span>
                              )}
                              #{r.number}

                              {r.needsCleaning && !r.issue && (
                                <span title="Temizlik bekliyor" className="inline-flex">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                </span>
                              )}
                              {r.issue && (
                                <span title={r.issue} className="inline-flex">
                                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">{p.name}</div>
                          </div>
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
                              (() => {
                                const c = guestColor(occupant.guestName);
                                const sc = sourceColor(occupant.source);
                                const isFirstDay = occupant.checkIn === dIso;
                                const label = `${sourceLabel(occupant.source)} · ${occupant.guestName.split(" ")[0]}`;
                                return (
                                  <div
                                    className="absolute inset-1 rounded text-[11px] px-1.5 flex items-center font-medium overflow-hidden"
                                    style={{ background: c.bg, color: c.fg, borderLeft: `3px solid ${sc}` }}
                                    title={`${occupant.guestName} · ${sourceLabel(occupant.source)}\n${occupant.checkIn} → ${occupant.checkOut}`}
                                  >
                                    {isFirstDay && <span className="truncate">{label}</span>}
                                    {occupant.realId && (
                                      <button
                                        onClick={() => setEditId(occupant.realId)}
                                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                                        title="Düzenle"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })()
                            ) : (
                              <button
                                onClick={() =>
                                  setNewRes({ date: dIso, propertyId: p.id, roomNumber: r.number })
                                }
                                className="absolute inset-0 opacity-30 hover:opacity-100 transition-opacity hover:bg-primary/15 grid place-items-center text-muted-foreground hover:text-primary"
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
        <div className="flex flex-wrap items-center gap-4 mt-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "hsl(220 65% 90%)", borderLeft: "3px solid #003580" }} /> Renk = misafir, kenar = kanal</div>
          <div className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-500" /> Temizlik bekliyor</div>
          <div className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Sorunlu oda</div>
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

      <EditReservationDialog
        open={!!editId}
        onOpenChange={(o) => !o && setEditId(null)}
        reservationId={editId}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </AppShell>
  );
}
