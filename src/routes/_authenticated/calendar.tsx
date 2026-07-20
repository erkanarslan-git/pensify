import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Section } from "@/components/app-shell";
import {
  reservations as demoReservations,
  rooms as demoRooms,
  properties as demoProperties,
} from "@/lib/demo-data";
import { useEffect, useState, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Pencil, Sparkles, AlertTriangle, Keyboard, X, MousePointerClick } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { supabase } from "@/integrations/supabase/client";
import { guestColor, sourceColor, sourceLabel, ACTIVE_CHANNELS } from "@/lib/guest-color";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";

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
  const perms = usePermissions();
  const canCreatePast = perms.can("create_past_reservation");
  const canCreate = perms.can("create_reservation");
  const isManagerOnly =
    perms.roles.includes("manager") && !perms.roles.includes("admin") && !perms.roles.includes("owner");
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
  const [showHelp, setShowHelp] = useState(false);
  const [pendingPast, setPendingPast] = useState<{ date: string; propertyId?: string; roomNumber?: string } | null>(null);
  const gridFocusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Auto-focus calendar grid so keyboard navigation works immediately
    const t = setTimeout(() => gridFocusRef.current?.focus({ preventScroll: true }), 50);
    return () => clearTimeout(t);
  }, []);

  // Helper: is given iso date strictly before today?
  const todayIsoStr = new Date().toISOString().slice(0, 10);
  const isPastDate = (dIso: string) => dIso < todayIsoStr;

  function tryOpenNew(payload: { date: string; propertyId?: string; roomNumber?: string }) {
    if (isPastDate(payload.date)) {
      if (!canCreatePast) {
        toast.error("Vergangene Buchungen", { description: "Nur Manager, Admin oder Inhaber können vergangene Daten anlegen." });
        return;
      }
      if (isManagerOnly) {
        setPendingPast(payload);
        return;
      }
    }
    setNewRes(payload);
  }

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

  // Flat ordered list of rooms (matches render order) for keyboard nav
  const flatRooms = useMemo(() => {
    const out: { room: UnifiedRoom; property: UnifiedProperty }[] = [];
    properties
      .filter((p) => propertyId === "all" || p.id === propertyId)
      .forEach((p) => {
        filteredRooms.filter((r) => r.propertyId === p.id).forEach((room) => out.push({ room, property: p }));
      });
    return out;
  }, [properties, filteredRooms, propertyId]);

  const [focus, setFocus] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  useEffect(() => {
    setFocus((f) => ({
      row: Math.min(f.row, Math.max(0, flatRooms.length - 1)),
      col: Math.min(f.col, Math.max(0, days.length - 1)),
    }));
  }, [flatRooms.length, days.length]);

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (newRes || editId) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === "?" || (e.shiftKey && e.key === "/")) {
      e.preventDefault();
      setShowHelp((v) => !v);
      return;
    }
    if (e.key === "Escape" && showHelp) {
      e.preventDefault();
      setShowHelp(false);
      return;
    }
    if (!flatRooms.length || !days.length) return;
    const { row, col } = focus;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (col < days.length - 1) setFocus({ row, col: col + 1 });
      else { shift(range); setFocus({ row, col: 0 }); }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (col > 0) setFocus({ row, col: col - 1 });
      else { shift(-range); setFocus({ row, col: days.length - 1 }); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocus({ row: Math.min(flatRooms.length - 1, row + 1), col });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocus({ row: Math.max(0, row - 1), col });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = flatRooms[row];
      const day = days[col];
      if (!entry || !day) return;
      const dIso = iso(day);
      const occupant = filteredReservations.find(
        (res) => res.roomId === entry.room.id && res.checkIn <= dIso && res.checkOut > dIso,
      );
      if (occupant?.realId) setEditId(occupant.realId);
      else if (canCreate) tryOpenNew({ date: dIso, propertyId: entry.property.id, roomNumber: entry.room.number });
    }
  };

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
            onClick={() => setShowHelp(true)}
            className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent"
            title="Tastatur-Kürzel (?)"
          >
            <Keyboard className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="px-3 h-9 rounded-md border border-border text-xs font-medium hover:bg-accent inline-flex items-center gap-1"
          >
            <CalendarIcon className="w-3.5 h-3.5" /> Heute
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
          <option value="all">Alle Pensionen</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          value={roomQ}
          onChange={(e) => setRoomQ(e.target.value)}
          placeholder="Zimmer-Nr…"
          className="px-3 py-2 rounded-md border border-input bg-card text-sm w-28"
        />
        <input
          value={guestQ}
          onChange={(e) => setGuestQ(e.target.value)}
          placeholder="Gast oder Buchungs-Code…"
          className="px-3 py-2 rounded-md border border-input bg-card text-sm w-64"
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

      {/* Kanal-Legende */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3 text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wide font-medium">Kanal:</span>
        {ACTIVE_CHANNELS.map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: sourceColor(s) }} />
            {sourceLabel(s)}
          </span>
        ))}
      </div>



      <Section title={`${iso(days[0])} — ${iso(days[days.length - 1])} · ${filteredRooms.length} Zimmer`}>
        <div
          ref={gridFocusRef}
          tabIndex={0}
          onKeyDown={onGridKeyDown}
          className="outline-none focus:ring-2 focus:ring-primary/30 rounded-md"
        >
        <ScrollableGrid>
          <div className="min-w-[900px] px-5">

            <div className="grid" style={{ gridTemplateColumns: `220px repeat(${days.length}, minmax(60px, 1fr))` }}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 border-b border-border">Zimmer</div>
              {days.map((d, dIdx) => {
                const isToday = iso(d) === today;
                const isFocusCol = dIdx === focus.col;
                const past = isPastDate(iso(d));
                return (
                  <div key={iso(d)} className={`text-center py-3 border-b border-border ${isToday ? "bg-primary/5" : ""} ${isFocusCol ? "bg-primary/10" : ""} ${past ? "text-muted-foreground/70" : ""}`}>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                    <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
                  </div>
                );
              })}

              {flatRooms.flatMap(({ room: r, property: p }, rowIdx) => {
                const cells: React.ReactNode[] = [];
                cells.push(
                  <div key={`${r.id}-label`} className={`py-3 pr-3 border-b border-border text-sm flex items-center gap-2 ${rowIdx === focus.row ? "bg-primary/10" : ""}`}>
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
                          <span title="Reinigung ausstehend" className="inline-flex">
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
                days.forEach((d, dIdx) => {
                  const dIso = iso(d);
                  const occupant = filteredReservations.find(
                    (res) => res.roomId === r.id && res.checkIn <= dIso && res.checkOut > dIso,
                  );
                  const prevIso = dIdx > 0 ? iso(days[dIdx - 1]) : null;
                  const isOccupantStart =
                    !!occupant &&
                    (prevIso === null || !(occupant.checkIn <= prevIso && occupant.checkOut > prevIso));
                  let span = 1;
                  if (isOccupantStart && occupant) {
                    for (let k = dIdx + 1; k < days.length; k++) {
                      const kIso = iso(days[k]);
                      if (occupant.checkIn <= kIso && occupant.checkOut > kIso) span++;
                      else break;
                    }
                  }
                  const isFocused = rowIdx === focus.row && dIdx === focus.col;
                  const past = isPastDate(dIso);
                  const pastStyle = past
                    ? {
                        backgroundImage:
                          "repeating-linear-gradient(135deg, hsl(var(--muted)/0.35) 0 6px, transparent 6px 12px)",
                      }
                    : undefined;
                  cells.push(
                    <div
                      key={`${r.id}-${dIso}`}
                      onClick={() => setFocus({ row: rowIdx, col: dIdx })}
                      style={pastStyle}
                      className={`border-b border-l border-border h-12 relative group ${past ? "bg-muted/30" : ""} ${isFocused ? "ring-2 ring-primary ring-inset z-10" : ""}`}
                    >
                      {occupant && isOccupantStart ? (
                        (() => {
                          const c = guestColor(occupant.guestName);
                          const sc = sourceColor(occupant.source);
                          const label = occupant.guestName.split(" ")[0];
                          const occPast = isPastDate(occupant.checkIn);
                          return (
                            <div
                              className={`absolute top-1 bottom-1 left-1 rounded text-[11px] px-1.5 flex items-center font-medium overflow-hidden z-10 ${occPast && !canCreatePast ? "opacity-70" : ""}`}
                              style={{
                                width: `calc(${span} * 100% - 8px)`,
                                background: c.bg,
                                color: c.fg,
                                borderLeft: `3px solid ${sc}`,
                              }}
                              title={`${occupant.guestName} · ${sourceLabel(occupant.source)}\n${occupant.checkIn} → ${occupant.checkOut}${occPast && !canCreatePast ? "\n(Vergangen — nur Manager/Admin/Inhaber dürfen bearbeiten)" : ""}`}
                            >
                              <span className="truncate">{label}</span>
                              {occupant.realId && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditId(occupant.realId); }}
                                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
                                  title={occPast && !canCreatePast ? "Ansehen" : "Bearbeiten"}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })()
                      ) : occupant ? null : (
                        canCreate && (!past || canCreatePast) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocus({ row: rowIdx, col: dIdx });
                              tryOpenNew({ date: dIso, propertyId: p.id, roomNumber: r.number });
                            }}
                            className="absolute inset-0 opacity-30 hover:opacity-100 transition-opacity hover:bg-primary/15 grid place-items-center text-muted-foreground hover:text-primary"
                            title={past ? `Vergangene Buchung anlegen · #${r.number} · ${dIso}` : `Neue Buchung · #${r.number} · ${dIso}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>,
                  );
                });
                return cells;
              })}
            </div>
          </div>
        </ScrollableGrid>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: "hsl(220 65% 90%)", borderLeft: "3px solid #003580" }} /> Farbe = Gast, Rand = Kanal</div>
          <div className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-500" /> Reinigung ausstehend</div>
          <div className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Problem-Zimmer</div>
          <button onClick={() => setShowHelp(true)} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-card text-[10px]">?</kbd> Tastatur-Kürzel
          </button>
          <Link to="/reservations" className="ml-auto text-primary text-xs underline">Alle Buchungen →</Link>
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

      {showHelp && (
        <div
          className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4" />
                <h3 className="font-semibold">Tastatur-Kürzel</h3>
              </div>
              <button onClick={() => setShowHelp(false)} className="p-1 rounded hover:bg-accent" title="Schließen">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Klicke zuerst in den Kalender, damit die Kürzel aktiv sind.
            </p>
            <div className="space-y-2 text-sm">
              {[
                { keys: ["↑", "↓", "←", "→"], desc: "Zwischen Zellen navigieren" },
                { keys: ["←", "→"], desc: "Am Rand: vorherige / nächste Periode" },
                { keys: ["Enter"], desc: "Belegt: Buchung bearbeiten · Frei: neue Buchung" },
                { keys: ["?"], desc: "Diese Hilfe ein-/ausblenden" },
                { keys: ["Esc"], desc: "Dialoge / Hilfe schließen" },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{row.desc}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map((k) => (
                      <kbd key={k} className="px-2 py-0.5 rounded border border-border bg-muted text-[11px] font-mono min-w-[24px] text-center">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
              <div className="font-medium mb-1.5 text-foreground">Maus</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Klick auf Zelle: auswählen</li>
                <li>Klick auf <Plus className="inline w-3 h-3" />: neue Buchung</li>
                <li>Ziehen: horizontal scrollen</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {pendingPast && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setPendingPast(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <h3 className="font-semibold">Vergangene Buchung anlegen?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Du legst eine Buchung für ein vergangenes Datum an ({pendingPast.date}). Das betrifft Berichte und Abrechnungen. Bitte nur, wenn es ein nachgetragener Eintrag ist.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingPast(null)} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">Abbrechen</button>
              <button
                onClick={() => { const p = pendingPast; setPendingPast(null); setNewRes(p); }}
                className="px-3 py-2 rounded-md bg-warning text-warning-foreground text-sm font-medium hover:opacity-90"
              >
                Trotzdem anlegen
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ScrollableGrid({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const drag = useRef<{ startX: number; startScroll: number; active: boolean; moved: boolean }>({ startX: 0, startScroll: 0, active: false, moved: false });

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [children]);

  const step = () => (ref.current?.clientWidth ?? 600) * 0.7;
  const scrollBy = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: "smooth" });

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, [role='button']")) return;
    const el = ref.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScroll: el.scrollLeft, active: true, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current.active || !ref.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    ref.current.scrollLeft = drag.current.startScroll - dx;
  };
  const endDrag = () => { drag.current.active = false; };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) { e.stopPropagation(); e.preventDefault(); drag.current.moved = false; }
  };

  return (
    <div className="relative -m-5">
      <div
        ref={ref}
        className="overflow-x-auto select-none cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
      {canLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-step())}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-card/95 border border-border shadow-md grid place-items-center hover:bg-accent transition-colors"
          aria-label="Nach links scrollen"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollBy(step())}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-card/95 border border-border shadow-md grid place-items-center hover:bg-accent transition-colors"
          aria-label="Nach rechts scrollen"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
