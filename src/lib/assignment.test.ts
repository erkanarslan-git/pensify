import { describe, expect, it } from "vitest";
import { canChangeCleaningAssignment, taskAssignmentOptions } from "./assignment";
describe("cleaning assignment", () => {
  it("offers only employees permitted for the task property", () => {
    expect(taskAssignmentOptions([
      { property_id: "a", cleaner_id: "one", full_name: "One" },
      { property_id: "b", cleaner_id: "two", full_name: "Two" },
    ], "a").map((o) => o.cleaner_id)).toEqual(["one"]);
  });
  it("does not move started, problem or completed work to another employee", () => {
    expect(["pending", "accepted", "in_progress", "problem", "completed"].map(canChangeCleaningAssignment)).toEqual([true, true, false, false, false]);
  });
});