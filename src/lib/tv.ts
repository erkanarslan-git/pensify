import { z } from "zod";

const count = z.number().int().nonnegative();
export const tvTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const tvSnapshotSchema = z.object({
  organization: z.string(), at: z.string(), day: z.string(),
  totals: z.object({ total: count, occupied: count, ready: count, cleaning: count, maintenance: count, arrivals: count, departures: count, created: count }).strict(),
  properties: z.array(z.object({ name: z.string(), total: count, occupied: count, ready: count, cleaning: count, maintenance: count, arrivals: count, departures: count }).strict()),
  weekly: z.array(z.object({ day: z.string(), arrivals: count, departures: count }).strict()),
  events: z.array(z.object({ id: z.string(), at: z.string(), kind: z.enum(["reservation_created", "reservation_removed", "reservation_updated", "cleaning_updated", "maintenance_updated", "task_updated"]), source: z.string() }).strict()),
  dues: z.object({ overdue: count, dueToday: count, dueWeek: count }).strict(),
  colors: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)),
}).strict();
export type TvSnapshot = z.infer<typeof tvSnapshotSchema>;

/** Initial and restored connections establish a baseline, never replay old sounds. */
export function newTvEvents(previous: string[] | null, events: TvSnapshot["events"], reconnecting = false) {
  if (previous === null || reconnecting) return [];
  const seen = new Set(previous);
  return events.filter(event => !seen.has(event.id)).filter((event, index, all) => all.findIndex(other => other.id === event.id) === index);
}

export function tvDeltas(previous: TvSnapshot["totals"] | null, current: TvSnapshot["totals"]) {
  return Object.fromEntries(Object.entries(current).map(([key, value]) => [key, previous ? value - previous[key as keyof typeof previous] : 0])) as Record<keyof TvSnapshot["totals"], number>;
}