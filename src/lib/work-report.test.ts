import { describe, expect, it } from "vitest";
import { presetRange, countTopics, dailySeries, byLocation, byStaff, teamItems, filterItems, type WorkItem } from "./work-report";

const item = (p: Partial<WorkItem>): WorkItem => ({ id: "x", topic: "clean_done", kind: "cleaning", at: null, day: "2026-10-22", propertyId: "p1", propertyName: "A", room: "1", staffId: null, staff: null, status: "completed", source: "app", title: "", note: null, ...p });

describe("work report", () => {
  it("default range is today", () => expect(presetRange("today", "2026-10-22")).toEqual({ from: "2026-10-22", to: "2026-10-22" }));
  it("yesterday crosses month", () => expect(presetRange("yesterday", "2026-11-01")).toEqual({ from: "2026-10-31", to: "2026-10-31" }));
  it("week is last 7 days", () => expect(presetRange("week", "2026-10-22")).toEqual({ from: "2026-10-16", to: "2026-10-22" }));
  it("month starts on the 1st", () => expect(presetRange("month", "2026-10-22").from).toBe("2026-10-01"));
  it("topics are counted separately", () => {
    const c = countTopics([item({}), item({ topic: "todo_done" }), item({})]);
    expect(c.clean_done).toBe(2);
    expect(c.todo_done).toBe(1);
  });
  it("open work is not in the daily done chart", () => {
    const s = dailySeries([item({}), item({ topic: "clean_open" })], "2026-10-22", "2026-10-22");
    expect(s[0].cleaning).toBe(1);
  });
  it("to-dos without location stay out of location table", () => {
    expect(byLocation([item({ topic: "todo_done", propertyId: null })])).toHaveLength(0);
  });
  const mixed = [item({ topic: "clean_done", staffId: "cleaner" }), item({ topic: "res_new", staffId: "office" }), item({ topic: "todo_overdue", staffId: "office" }), item({ topic: "issue_done", kind: "issue", reporterId: "reporter", reporter: "Reporter", resolverId: "repairer", resolver: "Repairer" })];
  it("all keeps every work type", () => expect(teamItems(mixed, "all")).toHaveLength(4));
  it("cleaning excludes office and maintenance work and people", () => {
    expect(teamItems(mixed, "cleaning").map((i) => i.topic)).toEqual(["clean_done"]);
    expect(byStaff(teamItems(mixed, "cleaning")).map((i) => i.staffId)).toEqual(["cleaner"]);
  });
  it("office keeps reservations and general tasks only", () => {
    expect(teamItems(mixed, "office").map((i) => i.topic)).toEqual(["res_new", "todo_overdue"]);
    expect(byStaff(teamItems(mixed, "office")).map((i) => i.staffId)).toEqual(["office"]);
  });
  it("maintenance does not credit the reporter with resolving work", () => {
    const rows = byStaff(teamItems(mixed, "maintenance"));
    expect(rows.find((r) => r.staffId === "reporter")).toMatchObject({ reported: 1, resolved: 0, counts: { issue_done: 0 } });
    expect(rows.find((r) => r.staffId === "repairer")).toMatchObject({ reported: 0, resolved: 1, counts: { issue_done: 1 } });
  });
  it("reporter and resolver drill downs keep distinct attribution", () => {
    expect(filterItems(mixed, { staff: "reporter", staffRole: "reporter" })).toHaveLength(1);
    expect(filterItems(mixed, { staff: "reporter", staffRole: "resolver" })).toHaveLength(0);
    expect(filterItems(mixed, { staff: "repairer", staffRole: "resolver" })).toHaveLength(1);
  });
});
