import { describe, it, expect } from "vitest";
import { dailyOccupancy, heatLevel } from "./occupancy-overview";

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
