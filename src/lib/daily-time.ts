import { localWorkDate } from './attendance';
export type DailyTimeEntry = { id: string; cleaner_id: string; clock_in_at: string; clock_out_at: string | null; break_minutes: number; break_started_at: string | null; needs_review: boolean; properties: { name: string } | null };
export function dailyTime(entries: DailyTimeEntry[], day: string, now: number) {
  const sessions = entries.filter(e => localWorkDate(e.clock_in_at) === day);
  let breakMinutes = 0;
  let netMinutes = 0;
  for (const e of sessions) {
    const end = e.clock_out_at ? Date.parse(e.clock_out_at) : now;
    const ongoing = !e.clock_out_at && e.break_started_at ? Math.max(0, Math.round((now - Date.parse(e.break_started_at)) / 60000)) : 0;
    const pauses = (e.break_minutes ?? 0) + ongoing;
    breakMinutes += pauses;
    // Review entries remain visible, but never count as confirmed worked time.
    if (!e.needs_review) netMinutes += Math.max(0, Math.round((end - Date.parse(e.clock_in_at)) / 60000) - pauses);
  }
  return { sessions, breakMinutes, netMinutes, needsReview: sessions.some(e => e.needs_review), active: sessions.some(e => !e.clock_out_at) };
}