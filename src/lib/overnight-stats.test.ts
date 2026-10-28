import { describe, it, expect } from "vitest";
import { overlapNights, monthRange, stayTotals, totalsByProperty, extensionDays } from "./overnight-stats";

describe("overnight stats", () => {
  it("counts a 1→5 June stay as 4 nights", () => {
    expect(overlapNights("2026-06-01", "2026-06-05", "2026-06-01", "2026-07-01")).toBe(4);
  });
  it("splits a stay across months", () => {
    const jun = monthRange(2026, 6), jul = monthRange(2026, 7);
    expect(overlapNights("2026-06-28", "2026-07-03", jun.from, jun.to)).toBe(3);
    expect(overlapNights("2026-06-28", "2026-07-03", jul.from, jul.to)).toBe(2);
  });
  it("December range ends at next January", () => {
    expect(monthRange(2026, 12)).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
  it("person nights = nights × guests when count is known", () => {
    expect(stayTotals({ property_id: "p", check_in: "2026-06-01", check_out: "2026-06-04", guests_count: 2, guests_confirmed: true }, "2026-06-01", "2026-07-01"))
      .toEqual({ roomNights: 3, personNights: 6, unknownNights: 0 });
  });
  it("unknown guest count goes to nights without persons", () => {
    expect(stayTotals({ property_id: "p", check_in: "2026-06-01", check_out: "2026-06-04", guests_count: 1, guests_confirmed: false }, "2026-06-01", "2026-07-01"))
      .toEqual({ roomNights: 3, personNights: 0, unknownNights: 3 });
  });
  it("aggregates per property", () => {
    const m = totalsByProperty([
      { property_id: "a", check_in: "2026-06-01", check_out: "2026-06-03", guests_count: 1, guests_confirmed: true },
      { property_id: "a", check_in: "2026-06-10", check_out: "2026-06-11", guests_count: 3, guests_confirmed: true },
      { property_id: "b", check_in: "2026-05-01", check_out: "2026-05-03", guests_count: 1, guests_confirmed: true },
    ], "2026-06-01", "2026-07-01");
    expect(m.get("a")).toEqual({ roomNights: 3, personNights: 5, unknownNights: 0 });
    expect(m.has("b")).toBe(false);
  });
  it("extension 5th → 10th is 5 days", () => {
    expect(extensionDays("2026-06-05", "2026-06-10")).toBe(5);
  });
});
