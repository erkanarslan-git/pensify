import { businessTime } from "./business-time";

export function isMorningDigestTime(now: Date): boolean {
  return businessTime(now) === "08:00";
}

export function morningDigestBody(today: number, overdue: number, locale = "de"): string | null {
  if (today + overdue === 0) return null;
  if (locale.startsWith("tr")) return `Günaydın! Bugün ${today} göreviniz var. Geciken görev: ${overdue}.`;
  if (locale.startsWith("en")) return `Good morning! You have ${today} tasks today. Overdue tasks: ${overdue}.`;
  return `Guten Morgen! Heute haben Sie ${today} Aufgaben. Überfällige Aufgaben: ${overdue}.`;
}