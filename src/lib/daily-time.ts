import { businessDayBounds } from './business-time';
import type { AttendanceBreak } from './attendance-export';
export type DailyTimeEntry = { id: string; cleaner_id: string; clock_in_at: string; clock_out_at: string | null; break_minutes: number; break_started_at: string | null; needs_review: boolean; can_correct?: boolean; status?: string; properties: { name: string } | null };
/** UTC interval intersections, with cumulative rounding so adjacent days never duplicate minutes. */
export function dailyTime(entries: DailyTimeEntry[], day: string, now: number, breaks: AttendanceBreak[] = []) {
  const bounds = businessDayBounds(day);
  const dayStart = Date.parse(bounds.start), dayEnd = Date.parse(bounds.end);
  const overlap = (start: number, end: number) => Math.max(0, Math.round((Math.min(end, dayEnd) - start) / 60000) - Math.round((Math.max(start, dayStart) - start) / 60000));
  const sessions = entries.filter(e => {
    const start = Date.parse(e.clock_in_at), end = e.clock_out_at ? Date.parse(e.clock_out_at) : now;
    return start < dayEnd && end > dayStart || e.needs_review && start >= dayStart && start < dayEnd;
  });
  let breakMinutes = 0, netMinutes = 0, ongoingMinutes = 0;
  for (const e of sessions) {
    const start = Date.parse(e.clock_in_at);
    const end = e.clock_out_at ? Date.parse(e.clock_out_at) : now;
    const intervals = breaks.filter(b => b.time_entry_id === e.id).map(b => [Math.max(start, Date.parse(b.started_at)), Math.min(end, b.ended_at ? Date.parse(b.ended_at) : end)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    const merged: number[][] = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const gross = overlap(start, end);
    // Old aggregate-only pauses have no timestamps: distribute proportionally, never invent an interval.
    const aggregate = Math.min(Math.max(0, e.break_minutes), Math.max(0, Math.round((end - start) / 60000)));
    const fraction = (at: number) => Math.max(0, Math.min(1, (at - start) / Math.max(1, end - start)));
    const legacy = merged.length ? 0 : Math.max(0, Math.round(aggregate * fraction(dayEnd)) - Math.round(aggregate * fraction(dayStart)));
    const livePause = !merged.length && !e.clock_out_at && e.break_started_at ? overlap(Math.max(start, Date.parse(e.break_started_at)), end) : 0;
    const pauses = Math.min(gross, merged.reduce((sum, [a, b]) => sum + overlap(a, b), 0) + legacy + livePause);
    breakMinutes += pauses;
    if (!e.needs_review) {
      if (e.clock_out_at) netMinutes += Math.max(0, gross - pauses);
      else ongoingMinutes += Math.max(0, gross - pauses);
    }
  }
  return { sessions, breakMinutes, netMinutes, ongoingMinutes, needsReview: sessions.some(e => e.needs_review), active: sessions.some(e => !e.clock_out_at && !e.needs_review) };
}