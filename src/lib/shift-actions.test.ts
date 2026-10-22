import { describe, expect, it } from "vitest";
import { shiftActions, shiftState } from "./shift-actions";

describe("shiftActions", () => {
  it("not started: only start", () => {
    expect(shiftActions(null, "A")).toEqual(["start"]);
  });
  it("working: break and finish, no start", () => {
    expect(shiftActions({ property_id: "A", break_started_at: null }, "A")).toEqual(["break", "finish"]);
  });
  it("on break: resume and finish, never a second break", () => {
    expect(shiftActions({ property_id: "A", break_started_at: "2026-10-22T10:00:00Z" }, "A")).toEqual(["resume", "finish"]);
  });
  it("open shift elsewhere: nothing until finished there", () => {
    expect(shiftActions({ property_id: "B", break_started_at: null }, "A")).toEqual([]);
    expect(shiftState({ property_id: "B", break_started_at: null }, "A")).toBe("elsewhere");
  });
  it("shortcut without scanned location cannot start", () => {
    expect(shiftActions(null, null)).toEqual([]);
  });
});
