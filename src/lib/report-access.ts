import { type WorkTeam, TEAM_TOPICS, type WorkItem } from "./work-report";

export const REPORT_TEAMS: WorkTeam[] = ["all", "cleaning", "office", "maintenance"];
export function reportTeams(values: unknown): WorkTeam[] {
  return Array.isArray(values) ? REPORT_TEAMS.filter((team) => values.includes(team)) : [];
}
export function effectiveReportTeam(requested: WorkTeam, allowed: WorkTeam[]): WorkTeam | null {
  return allowed.includes(requested) ? requested : allowed[0] ?? null;
}
export function scopedReportItems(items: WorkItem[], allowed: WorkTeam[]): WorkItem[] {
  const topics = new Set(allowed.flatMap((team) => TEAM_TOPICS[team]));
  return items.filter((item) => topics.has(item.topic));
}