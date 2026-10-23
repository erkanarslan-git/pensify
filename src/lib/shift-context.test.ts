import { describe, expect, it } from "vitest";
import { canStartShift } from "./shift-context";

describe("employee shift eligibility", () => {
  for (const department of ["cleaning", "maintenance", "office", "hr"]) {
    it(`${department} employees use the same shift screen`, () => {
      expect(canStartShift({ status: "employee", can_manage_team: false, cleaner: { id: department, full_name: "Ali" } })).toBe(true);
    });
  }
  it("team administration alone does not enable personal clock-in", () => {
    expect(canStartShift({ status: "not_employee", can_manage_team: true })).toBe(false);
  });
  it("removed employees may finish an open shift but cannot start another", () => {
    expect(canStartShift({ status: "not_employee", can_manage_team: false, cleaner: { id: "c", full_name: "Ali" }, open: { id: "e", property_id: "p", clock_in_at: "2026-10-23T06:00:00Z", break_minutes: 0, break_started_at: null, properties: { name: "Hotel" } } })).toBe(false);
  });
  it("missing organization membership fails closed", () => {
    expect(canStartShift({ status: "no_membership", can_manage_team: false })).toBe(false);
  });
});