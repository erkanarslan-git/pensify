import { describe, expect, it } from "vitest";
import { presetRange, countTopics, dailySeries, byLocation, type WorkItem } from "./work-report";

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
});
