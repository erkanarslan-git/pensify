export type TodoPriority = "low" | "normal" | "high" | "urgent";
export interface TodoLike { due_date: string | null; due_at?: string | null; done: boolean; priority: string }

const RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Workers always note tasks for themselves; office staff and leads may leave tasks unassigned. */
export function resolveTodoAssignee(selected: string, context: { office: boolean; isLead: boolean; userId: string }): string | null {
  return context.office || context.isLead ? selected || null : context.userId;
}

/** Overdue = not done and due date strictly before today (business date, YYYY-MM-DD). */
export function isOverdue(t: TodoLike, today: string, now = Date.now()): boolean {
  return !t.done && (t.due_at ? Date.parse(t.due_at) < now : !!t.due_date && t.due_date < today);
}

/** Open first; then overdue, then by due date (none last), then priority. */
export function sortTodos<T extends TodoLike>(list: T[], today: string): T[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const oa = isOverdue(a, today), ob = isOverdue(b, today);
    if (oa !== ob) return oa ? -1 : 1;
    const da = a.due_date ?? "9999", db = b.due_date ?? "9999";
    if (da !== db) return da < db ? -1 : 1;
    return (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2);
  });
}

export type TodoStatus = "done" | "late" | "soon" | "open" | "nodate";
/** Traffic-light state: green done, red overdue, orange due within 2 days, blue open, grey without date. */
export function todoStatus(t: TodoLike, today: string, now = Date.now()): TodoStatus {
  if (t.done) return "done";
  if (isOverdue(t, today, now)) return "late";
  if (!t.due_date) return "nodate";
  const days = Math.round((Date.parse(t.due_date) - Date.parse(today)) / 86400000);
  return days <= 2 ? "soon" : "open";
}
