import type { Absence, WorkSchedule } from './attendance';
import type { DailyTimeEntry } from './daily-time';
import type { AttendanceBreak } from './attendance-export';

export type AttendanceBoard = {
  org: string; timezone: string; can_schedule: boolean;
  members: { id: string; user_id: string; organization_id: string; active: boolean; can_absence: boolean }[];
  profiles: { id: string; full_name: string }[];
  cleaners: { id: string; user_id: string; full_name: string }[];
  schedules: (WorkSchedule & { id: string })[];
  absences: Absence[];
  entries: DailyTimeEntry[];
  breaks: AttendanceBreak[];
};