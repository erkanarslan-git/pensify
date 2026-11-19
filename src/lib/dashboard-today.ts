import { summarizeRooms } from "./room-summary";

export type TodayReservation = {
  id: string; guest_name: string | null; check_in: string; check_out: string;
  long_stay: boolean | null; property_id: string; status: string;
  room?: { number: string | null } | null; property?: { name: string | null } | null;
};

const ACTIVE = (r: TodayReservation) => !["cancelled", "no_show"].includes(r.status);

/** Today's arrivals (check_in = today) and departures (check_out = today), excluding cancelled/no-show. */
export function todayMovements(rows: TodayReservation[], today: string) {
  const live = rows.filter(ACTIVE);
  const byName = (a: TodayReservation, b: TodayReservation) => (a.guest_name ?? "").localeCompare(b.guest_name ?? "");
  return {
    arrivals: live.filter((r) => r.check_in === today).sort(byName),
    departures: live.filter((r) => r.check_out === today).sort(byName),
  };
}

export type PropertyCard = {
  id: string; name: string; total: number; occupied: number; available: number;
  cleaning: number; maintenance: number; longStay: number; arrivals: number; departures: number; rate: number;
};

/** One summary per property: room states from live room status, guest counts from today's reservations. */
export function propertyCards(
  props: { id: string; name: string }[],
  rooms: { property_id: string; status: string }[],
  rows: TodayReservation[],
  today: string,
): PropertyCard[] {
  const live = rows.filter(ACTIVE);
  return props.map((p) => {
    const s = summarizeRooms(rooms.filter((r) => r.property_id === p.id));
    const mine = live.filter((r) => r.property_id === p.id);
    return {
      id: p.id, name: p.name, total: s.total, occupied: s.occupied, available: s.available,
      cleaning: s.cleaning, maintenance: s.maintenance,
      longStay: mine.filter((r) => r.long_stay && r.check_in <= today && r.check_out > today).length,
      arrivals: mine.filter((r) => r.check_in === today).length,
      departures: mine.filter((r) => r.check_out === today).length,
      rate: s.total ? Math.round((s.occupied / s.total) * 100) : 0,
    };
  });
}
