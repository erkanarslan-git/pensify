import { z } from "zod";

const count = z.number().int().nonnegative();
export const tvTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const tvSnapshotSchema = z.object({
  organization: z.string(), at: z.string(), day: z.string(),
  rotationSeconds: z.union([z.literal(5),z.literal(10),z.literal(15),z.literal(20)]),
  metrics: z.object({created: count, automatic: count, manual: count, unknownOrigin: count, cleaned: count, review: count, maintenanceDone: count, maintenanceOpen: count, arrived: count, arrivalExpected: count, departed: count, departureExpected: count}).strict(),
  priorities: z.object({arrivalNotReady: count, cleaningPriority: count, dueOpen: count, maintenanceBlocking: count}).strict(),
  priorityDetails: z.array(z.object({location:z.string(),arrivalNotReady:count,cleaningPriority:count,dueOpen:count,maintenanceBlocking:count}).strict()),
  totals: z.object({ total: count, occupied: count, ready: count, cleaning: count, maintenance: count, arrivals: count, departures: count, created: count }).strict(),
  properties: z.array(z.object({ name: z.string(), total: count, occupied: count, ready: count, cleaning: count, maintenance: count, arrivals: count, departures: count }).strict()),
  weekly: z.array(z.object({ day: z.string(), arrivals: count, departures: count }).strict()),
  events: z.array(z.object({ id: z.string(), at: z.string(), kind: z.enum(["reservation_created", "reservation_removed", "reservation_updated", "cleaning_updated", "maintenance_updated", "task_updated"]), source: z.string(), location: z.string(), eligible: z.boolean() }).strict()),
  dues: z.object({ overdue: count, dueToday: count, dueWeek: count, paid: count, partial: count, open: count }).strict(),
  colors: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)),
}).strict().refine(s=>s.metrics.created===s.metrics.manual+s.metrics.automatic+s.metrics.unknownOrigin, "Reservation origin counts must reconcile").refine(s=>s.dues.dueToday===s.dues.paid+s.dues.partial+s.dues.open, "Payment states must reconcile");
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
export const TV_DELTA_MS = 8000;
export const TV_CELEBRATION_MS = 5000;
export function tvMetricValues(s: TvSnapshot) {
 return { created: s.metrics.created, cleaned: s.metrics.cleaned, maintenanceDone: s.metrics.maintenanceDone, occupied: s.totals.occupied, arrivals: s.totals.arrivals, departures: s.totals.departures, dueToday: s.dues.dueToday, ready: s.totals.ready };
}
export function tvUpdate(previous: TvSnapshot | null, current: TvSnapshot, reconnecting = false) {
 const reset = !previous || reconnecting || current.day !== previous.day || Date.parse(current.at) - Date.parse(previous.at) > 90000;
 const older = !!previous && Date.parse(current.at) <= Date.parse(previous.at);
 const values = tvMetricValues(current);
 const before = previous ? tvMetricValues(previous) : values;
 const deltas = Object.fromEntries(Object.entries(values).map(([key,value]) => [key, reset || older ? 0 : value - before[key as keyof typeof before]])) as Record<keyof typeof values,number>;
 const events = reset || older ? [] : newTvEvents(previous.events.map(e=>e.id),current.events).filter(e=>Date.parse(e.at)>Date.parse(previous.at));
 return { deltas, events, celebrations: events.filter(e=>e.kind==='reservation_created' && e.eligible && !!e.location) };
}
export function nextTvPage(page: number, pages: number) { return pages > 1 ? (page + 1) % pages : 0; }

/** Two balanced pages at most; odd counts reserve the same row tracks. */
export function tvLocationLayout(total: number, capacity: number) {
 const pages = total > Math.max(1, capacity) ? 2 : 1;
 return { pages, slots: Math.max(1, Math.ceil(total / pages)) };
}
