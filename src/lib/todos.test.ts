import { describe, it, expect } from "vitest";
import { isOverdue, sortTodos } from "./todos";

describe("todos", () => {
  it("a timed task becomes overdue during its due day", () => {
    expect(isOverdue({ due_date: "2026-10-23", due_at: "2026-10-23T08:00:00Z", done: false, priority: "normal" }, "2026-10-23", Date.parse("2026-10-23T09:00:00Z"))).toBe(true);
    expect(isOverdue({ due_date: "2026-10-23", due_at: "2026-10-23T10:00:00Z", done: false, priority: "normal" }, "2026-10-23", Date.parse("2026-10-23T09:00:00Z"))).toBe(false);
  });
  it("open task with past due date is overdue", () => {
    expect(isOverdue({ due_date: "2026-10-21", done: false, priority: "normal" }, "2026-10-22")).toBe(true);
  });
  it("task due today is not overdue", () => {
    expect(isOverdue({ due_date: "2026-10-22", done: false, priority: "normal" }, "2026-10-22")).toBe(false);
  });
  it("done task is never overdue", () => {
    expect(isOverdue({ due_date: "2026-10-01", done: true, priority: "urgent" }, "2026-10-22")).toBe(false);
  });
  it("overdue tasks come first, then urgent before low on same day", () => {
    const r = sortTodos([
      { id: "low", due_date: "2026-10-25", done: false, priority: "low" },
      { id: "urg", due_date: "2026-10-25", done: false, priority: "urgent" },
      { id: "late", due_date: "2026-10-20", done: false, priority: "low" },
      { id: "done", due_date: "2026-10-01", done: true, priority: "urgent" },
    ], "2026-10-22");
    expect(r.map((x) => x.id)).toEqual(["late", "urg", "low", "done"]);
  });
});
