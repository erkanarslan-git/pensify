export type TodoPriority = "low" | "normal" | "high" | "urgent";
export interface TodoLike { due_date: string | null; done: boolean; priority: string }

const RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Overdue = not done and due date strictly before today (business date, YYYY-MM-DD). */
export function isOverdue(t: TodoLike, today: string): boolean {
  return !t.done && !!t.due_date && t.due_date < today;
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
