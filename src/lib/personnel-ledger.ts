import { attendanceDays } from './attendance';
import { dailyTime } from './daily-time';
import type { AttendanceBoard } from './attendance-board';

export const hoursMinutes = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
export function personnelLedger(board: AttendanceBoard, memberId: string, from: string, to: string, now: number, today: string, allDays: boolean) {
 const member = board.members.find(m => m.id === memberId);
 const ids = new Set(board.cleaners.filter(c => c.user_id === member?.user_id).map(c => c.id));
 const entries = board.entries.filter(e => ids.has(e.cleaner_id));
 const dates = attendanceDays(memberId, from, to, board.schedules, board.absences, new Set());
 const rows = dates.map(day => {
  const time = dailyTime(entries, day.date, now, board.breaks);
  const absences = board.absences.filter(a => a.member_id === memberId && !a.cancelled && a.start_date <= day.date && a.end_date >= day.date);
  const worked = time.sessions.length > 0;
  const emptyStatus = day.status === 'missing' ? (day.date > today ? 'future' : 'expected') : day.status;
  const statuses = [...new Set([...(worked ? ['worked'] : []), ...absences.map(a => a.kind)])];
  return { ...day, worked, status: statuses[0] ?? emptyStatus, statuses: statuses.length ? statuses : [emptyStatus], absences, time };
 });
 const visible = allDays ? rows : rows.filter(r => r.worked || r.absences.length > 0 || r.time.needsReview);
 return { entries, rows: visible, summary: { worked: rows.filter(r => r.worked).length, sick: rows.filter(r => r.absences.some(a => a.kind === 'sick')).length, leave: rows.filter(r => r.absences.some(a => a.kind === 'leave')).length, net: rows.reduce((s,r) => s+r.time.netMinutes,0), review: new Set(rows.flatMap(r => r.time.sessions.filter(e => e.needs_review).map(e => e.id))).size } };
}