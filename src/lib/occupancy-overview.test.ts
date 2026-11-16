import { describe, it, expect } from "vitest";
import { dailyOccupancy, heatLevel, overviewMonthStart, shiftOverviewMonth } from "./occupancy-overview";

describe("selected overview period", () => {
  it("uses the selected past or future month, not the current month", () => {
    expect(overviewMonthStart("2025-01-24")).toBe("2025-01-01");
    expect(overviewMonthStart("2027-06-12")).toBe("2027-06-01");
  });
  it("moves monthly and yearly periods across year boundaries", () => {
    expect(shiftOverviewMonth("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftOverviewMonth("2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftOverviewMonth("2026-11-16", 12)).toBe("2027-11-01");
  });
  it("calculates different occupancy for different selected periods", () => {
    const reservations = [{ room_id: "a", check_in: "2026-11-01", check_out: "2026-12-01" }];
    expect(dailyOccupancy(overviewMonthStart("2026-11-16"), 30, 4, reservations)[0].rate).toBe(0.25);
    expect(dailyOccupancy(overviewMonthStart("2027-01-16"), 31, 4, reservations)[0].rate).toBe(0);
  });
});

describe("dailyOccupancy", () => {
  it("counts the check-out day as free and arrival/departure moves", () => {
    const d = dailyOccupancy("2026-11-01", 3, 4, [{ room_id: "a", check_in: "2026-11-01", check_out: "2026-11-02" }]);
    expect(d[0]).toMatchObject({ occupied: 1, free: 3, arrivals: 1 });
    expect(d[1]).toMatchObject({ occupied: 0, free: 4, departures: 1 });
  });
  it("counts one room once even with overlapping rows", () => {
    const d = dailyOccupancy("2026-11-01", 1, 2, [
      { room_id: "a", check_in: "2026-10-01", check_out: "2026-12-01" },
      { room_id: "a", check_in: "2026-11-01", check_out: "2026-11-03" },
    ]);
    expect(d[0].occupied).toBe(1);
    expect(d[0].rate).toBe(0.5);
  });
  it("full house is the strongest heat level", () => {
    expect(heatLevel(1)).toBe(4);
    expect(heatLevel(0)).toBe(0);
  });
});
