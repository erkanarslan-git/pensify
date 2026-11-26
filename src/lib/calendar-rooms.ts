export interface CalendarRoomOrder {
  id: string;
  number: string;
  floor?: number | null;
}

/** Keep every floor together, then order room numbers naturally (2 before 10). */
export function compareCalendarRooms(a: CalendarRoomOrder, b: CalendarRoomOrder): number {
  const floorA = a.floor ?? Number.MAX_SAFE_INTEGER;
  const floorB = b.floor ?? Number.MAX_SAFE_INTEGER;
  if (floorA !== floorB) return floorA - floorB;
  return a.number.localeCompare(b.number, "de", { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/** Stable, repeating soft color for each known floor; zero is the neutral unassigned group. */
export function calendarFloorTone(floor: number | null | undefined): number {
  if (floor == null) return 0;
  return ((floor % 6) + 6) % 6 + 1;
}
