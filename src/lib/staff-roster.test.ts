import { describe, it, expect } from "vitest";
import { departmentRoster } from "./staff-roster";
describe("department roster", () => {
  const members = [{ id: "a", user_id: "u", active: true }];
  const profiles = [{ id: "u", full_name: "Ali" }];
  it("keeps maintenance workers separate from office", () => {
    expect(departmentRoster("office", [{ member_id: "a", department: "maintenance", is_worker: true, is_lead: false }], members, profiles)).toEqual([]);
  });
  it("includes lead-only staff with their name without duplicating worker/lead", () => {
    const result = departmentRoster("maintenance", [{ member_id: "a", department: "maintenance", is_worker: false, is_lead: true }], members, profiles);
    expect(result).toHaveLength(1);
    expect(result[0].full_name).toBe("Ali");
    expect(result[0].is_lead).toBe(true);
  });
  it("does not infer membership for inaccessible people", () => {
    expect(departmentRoster("office", [{ member_id: "other", department: "office", is_worker: true, is_lead: false }], members, profiles)).toEqual([]);
  });
});