// Monthly room-night / person-night statistics (Beherbergungsstatistik).
// A night belongs to the date it starts: a stay 01.06 → 05.06 has 4 nights (1–4 June).

export interface StayForStats {
  property_id: string;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD (exclusive)
  guests_count: number;
  guests_confirmed: boolean;
}

export interface NightTotals { roomNights: number; personNights: number; unknownNights: number }

const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Nights of [checkIn, checkOut) that fall inside [from, to). */
export function overlapNights(checkIn: string, checkOut: string, from: string, to: string): number {
  const start = Math.max(toUtc(checkIn), toUtc(from));
  const end = Math.min(toUtc(checkOut), toUtc(to));
  return end > start ? Math.round((end - start) / DAY) : 0;
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return { from: `${year}-${pad(month)}-01`, to: `${next.y}-${pad(next.m)}-01` };
}

export function stayTotals(s: StayForStats, from: string, to: string): NightTotals {
  const n = overlapNights(s.check_in, s.check_out, from, to);
  return s.guests_confirmed
    ? { roomNights: n, personNights: n * Math.max(1, s.guests_count), unknownNights: 0 }
    : { roomNights: n, personNights: 0, unknownNights: n };
}

/** Totals per property for one period. */
export function totalsByProperty(stays: StayForStats[], from: string, to: string): Map<string, NightTotals> {
  const out = new Map<string, NightTotals>();
  for (const s of stays) {
    const t = stayTotals(s, from, to);
    if (!t.roomNights) continue;
    const cur = out.get(s.property_id) ?? { roomNights: 0, personNights: 0, unknownNights: 0 };
    cur.roomNights += t.roomNights; cur.personNights += t.personNights; cur.unknownNights += t.unknownNights;
    out.set(s.property_id, cur);
  }
  return out;
}

export function extensionDays(oldCheckOut: string, newCheckOut: string): number {
  return Math.round((toUtc(newCheckOut) - toUtc(oldCheckOut)) / DAY);
}
