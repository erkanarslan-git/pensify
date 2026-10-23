import { dailyTime, type DailyTimeEntry } from './daily-time';
import type { AttendanceDay } from './attendance';

export type AttendanceBreak = { id: string; time_entry_id: string; started_at: string; ended_at: string | null };
export function csvText(rows: string[][]) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(';')).join('\n');
}
export function attendanceExportDays(name: string, days: AttendanceDay[], entries: DailyTimeEntry[], status: (key: string) => string, now: number, breaks: AttendanceBreak[] = []) {
  return days.map(day => {
    const totals = dailyTime(entries, day.date, now, breaks);
    return [name, day.date, status(day.status), String(totals.sessions.length), String(totals.breakMinutes), String(totals.netMinutes), totals.needsReview ? status('review') : totals.active ? status('active') : '', String(totals.ongoingMinutes)];
  });
}