// Pure helpers for the owner "Work report" (Yapılan İşler). No I/O here.
export type Topic =
  | "res_new" | "res_cancelled"
  | "clean_done" | "clean_review" | "clean_open"
  | "issue_done" | "issue_open"
  | "todo_done" | "todo_open" | "todo_overdue";

export const DONE_TOPICS: Topic[] = ["res_new", "res_cancelled", "clean_done", "issue_done", "todo_done"];
export const OPEN_TOPICS: Topic[] = ["clean_review", "clean_open", "issue_open", "todo_open", "todo_overdue"];

export type WorkTeam = "all" | "cleaning" | "office" | "maintenance";
export const TEAM_TOPICS: Record<WorkTeam, Topic[]> = {
  all: [...DONE_TOPICS, ...OPEN_TOPICS],
  cleaning: ["clean_done", "clean_review", "clean_open"],
  office: ["res_new", "res_cancelled", "todo_done", "todo_open", "todo_overdue"],
  maintenance: ["issue_done", "issue_open"],
};
export function teamItems(items: WorkItem[], team: WorkTeam) {
  return items.filter((i) => TEAM_TOPICS[team].includes(i.topic));
}

/** Several open cleaning tasks for the same room are one cleaning job (same rule as the Cleaning page and menu badge). */
export function mergeOpenCleaningByRoom(items: WorkItem[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (i.topic !== "clean_open" || !i.propertyId || !i.room) return true;
    const key = `${i.propertyId}|${i.room}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface WorkItem {
  id: string;
  topic: Topic;
  kind: "reservation" | "cleaning" | "issue" | "todo";
  at: string | null; // ISO instant or date
  day: string | null; // business date YYYY-MM-DD for done items
  propertyId: string | null;
  propertyName: string | null;
  room: string | null;
  staffId: string | null;
  staff: string | null;
  reporterId?: string | null;
  reporter?: string | null;
  resolverId?: string | null;
  resolver?: string | null;
  status: string;
  source: string;
  title: string;
  note: string | null;
}

export type Preset = "today" | "yesterday" | "week" | "month" | "custom";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Inclusive business-date range for a preset. `today` is the Berlin business date. */
export function presetRange(preset: Preset, today: string, custom?: { from?: string; to?: string }): { from: string; to: string } {
  switch (preset) {
    case "yesterday": { const y = addDays(today, -1); return { from: y, to: y }; }
    case "week": return { from: addDays(today, -6), to: today };
    case "month": return { from: `${today.slice(0, 8)}01`, to: today };
    case "custom": {
      const from = custom?.from || today, to = custom?.to || from;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default: return { from: today, to: today };
  }
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Count per topic. Each topic is counted separately — never merged into one score. */
export function countTopics(items: WorkItem[]): Record<Topic, number> {
  const c = Object.fromEntries([...DONE_TOPICS, ...OPEN_TOPICS].map((t) => [t, 0])) as Record<Topic, number>;
  for (const i of items) c[i.topic]++;
  return c;
}

/** Daily completed-work counts per kind (done topics only). */
export function dailySeries(items: WorkItem[], from: string, to: string) {
  const days = daysBetween(from, to);
  const rows = days.map((day) => ({ day, reservations: 0, cleaning: 0, issues: 0, todos: 0 }));
  const idx = new Map(days.map((d, i) => [d, i]));
  for (const i of items) {
    if (!DONE_TOPICS.includes(i.topic) || !i.day) continue;
    const r = idx.get(i.day); if (r === undefined) continue;
    const row = rows[r];
    if (i.topic === "res_new") row.reservations++;
    else if (i.topic === "clean_done") row.cleaning++;
    else if (i.topic === "issue_done") row.issues++;
    else if (i.topic === "todo_done") row.todos++;
  }
  return rows;
}

/** Per-location topic counts. Items without a location (general to-dos) are excluded. */
export function byLocation(items: WorkItem[]) {
  const m = new Map<string, { propertyId: string; name: string; counts: Record<Topic, number> }>();
  for (const i of items) {
    if (!i.propertyId) continue;
    let row = m.get(i.propertyId);
    if (!row) { row = { propertyId: i.propertyId, name: i.propertyName ?? "—", counts: countTopics([]) }; m.set(i.propertyId, row); }
    row.counts[i.topic]++;
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterItems(items: WorkItem[], f: { topic?: string; propertyId?: string; staff?: string; staffRole?: string; room?: string; status?: string; source?: string; q?: string }) {
  const q = f.q?.trim().toLowerCase();
  return items.filter((i) =>
    (!f.topic || i.topic === f.topic) &&
    (!f.propertyId || i.propertyId === f.propertyId) &&
    (!f.staff || (f.staffRole === "reporter" ? i.reporterId === f.staff : f.staffRole === "resolver" ? i.resolverId === f.staff : [i.staffId, i.reporterId, i.resolverId].includes(f.staff))) &&
    (!f.room || i.room === f.room) &&
    (!f.status || i.status === f.status) &&
    (!f.source || i.source === f.source) &&
    (!q || [i.title, i.staff, i.reporter, i.resolver, i.room, i.propertyName, i.note].some((v) => v?.toLowerCase().includes(q))));
}

/** Staff view: done-work counts per person (secondary view, not the first screen). */
export function byStaff(items: WorkItem[]) {
  const m = new Map<string, { staffId: string; name: string; counts: Record<Topic, number>; reported: number; resolved: number }>();
  const get = (id: string, name: string | null | undefined) => {
    let row = m.get(id);
    if (!row) { row = { staffId: id, name: name ?? "—", counts: countTopics([]), reported: 0, resolved: 0 }; m.set(id, row); }
    return row;
  };
  for (const i of items) {
    if (i.kind === "issue") {
      if (i.reporterId) get(i.reporterId, i.reporter).reported++;
      if (i.resolverId && i.topic === "issue_done") {
        const row = get(i.resolverId, i.resolver);
        row.resolved++;
        row.counts.issue_done++;
      }
      continue;
    }
    if (!i.staffId) continue;
    get(i.staffId, i.staff).counts[i.topic]++;
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
