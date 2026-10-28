import { describe, it, expect } from "vitest";
import { isOverdue, sortTodos, resolveTodoAssignee } from "./todos";

describe("department task assignment defaults", () => {
  it.each(["cleaning", "maintenance"])("%s workers quick-add and reset to themselves", () => {
    const worker = { office: false, isLead: false, userId: "worker-id" };
    expect(resolveTodoAssignee("", worker)).toBe("worker-id");
    expect(resolveTodoAssignee("other-id", worker)).toBe("worker-id");
    expect(resolveTodoAssignee("", worker)).toBe("worker-id");
  });
  it("switching from a lead department to a worker department defaults to self", () => {
    expect(resolveTodoAssignee("", { office: false, isLead: true, userId: "self" })).toBeNull();
    expect(resolveTodoAssignee("", { office: false, isLead: false, userId: "self" })).toBe("self");
  });
  it("department leads can leave tasks unassigned or select a member", () => {
    const lead = { office: false, isLead: true, userId: "lead" };
    expect(resolveTodoAssignee("", lead)).toBeNull();
    expect(resolveTodoAssignee("member", lead)).toBe("member");
  });
  it("office staff keep optional assignment", () => {
    const office = { office: true, isLead: false, userId: "office" };
    expect(resolveTodoAssignee("", office)).toBeNull();
    expect(resolveTodoAssignee("member", office)).toBe("member");
  });
});

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

import { todoStatus } from "./todos";
describe("todoStatus colours", () => {
  const today = "2026-10-27";
  it("done is green", () => expect(todoStatus({ due_date: "2026-10-20", done: true, priority: "normal" }, today)).toBe("done"));
  it("past due is red", () => expect(todoStatus({ due_date: "2026-10-26", done: false, priority: "normal" }, today)).toBe("late"));
  it("due within 2 days is orange", () => expect(todoStatus({ due_date: "2026-10-29", done: false, priority: "normal" }, today)).toBe("soon"));
  it("later is open", () => expect(todoStatus({ due_date: "2026-10-30", done: false, priority: "normal" }, today)).toBe("open"));
  it("no date", () => expect(todoStatus({ due_date: null, done: false, priority: "normal" }, today)).toBe("nodate"));
});
