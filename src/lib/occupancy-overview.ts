// Pure helpers for the long-range occupancy views (month heatmap, year matrix).
export interface OverviewReservation { room_id: string; check_in: string; check_out: string }
export interface DayOccupancy { date: string; occupied: number; free: number; rate: number; arrivals: number; departures: number }

const DAY = 86_400_000;
export function overviewMonthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}
export function shiftOverviewMonth(date: string, months: number) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** A room counts as occupied on a night when check_in <= date < check_out. */
export function dailyOccupancy(start: string, days: number, totalRooms: number, reservations: OverviewReservation[]): DayOccupancy[] {
  const out: DayOccupancy[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const rooms = new Set<string>();
    let arrivals = 0, departures = 0;
    for (const r of reservations) {
      if (r.check_in <= date && r.check_out > date) rooms.add(r.room_id);
      if (r.check_in === date) arrivals++;
      if (r.check_out === date) departures++;
    }
    const occupied = Math.min(rooms.size, totalRooms);
    out.push({ date, occupied, free: Math.max(0, totalRooms - occupied), rate: totalRooms ? occupied / totalRooms : 0, arrivals, departures });
  }
  return out;
}

/** Heat level 0..4 used for colouring. */
export function heatLevel(rate: number) {
  if (rate <= 0) return 0;
  if (rate < 0.5) return 1;
  if (rate < 0.8) return 2;
  if (rate < 1) return 3;
  return 4;
}
