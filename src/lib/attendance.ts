import { addDays, format, getISODay, parseISO } from "date-fns";
import { businessDate } from "./business-time";

export type WorkSchedule = { member_id: string; effective_from: string; weekdays: number[] };
export type Absence = { id: string; member_id: string; start_date: string; end_date: string; kind: string; note: string; cancelled: boolean; created_at: string };
export type AttendanceDay = { date: string; status: string; absence?: Absence; worked: boolean };

export function attendanceDays(memberId: string, from: string, to: string, schedules: WorkSchedule[], absences: Absence[], workedDates: Set<string>): AttendanceDay[] {
  const days: AttendanceDay[] = [];
  const ordered = schedules.filter(s => s.member_id === memberId).sort((a,b) => b.effective_from.localeCompare(a.effective_from));
  if (!from || !to || from > to) return days;
  for (let day = parseISO(from); format(day, "yyyy-MM-dd") <= to && days.length < 367; day = addDays(day, 1)) {
    const date = format(day, "yyyy-MM-dd");
    const schedule = ordered.find(s => s.effective_from <= date);
    const absence = absences.find(a => a.member_id === memberId && !a.cancelled && a.start_date <= date && a.end_date >= date);
    const worked = workedDates.has(date);
    days.push({ date, worked, absence, status: absence?.kind ?? (worked ? "worked" : !schedule ? "unplanned" : !schedule.weekdays.includes(getISODay(day)) ? "off" : "missing") });
  }
  return days;
}

export function localWorkDate(timestamp: string, _timezone?: string): string {
  return businessDate(new Date(timestamp));
}