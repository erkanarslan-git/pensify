// Calendar-day helpers that never pass through UTC.
// `toISOString()` on a local-midnight Date shifts back one day in Berlin (UTC+1/+2).

export function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" as local midnight (not UTC). */
export function parseLocalIso(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysIso(dIso: string, n: number): string {
  const d = parseLocalIso(dIso);
  d.setDate(d.getDate() + n);
  return localIso(d);
}

/** Whole nights between two calendar days (DST-safe). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = parseLocalIso(checkIn), b = parseLocalIso(checkOut);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
