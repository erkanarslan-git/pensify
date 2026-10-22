import { describe, expect, it } from "vitest";
import { buildSchedule, installmentState, scheduleDueDates } from "./payments";

describe("payment plans", () => {
  it("uses check-in as first due date, then the guest's chosen day each month", () => {
    expect(scheduleDueDates("2026-01-10", "2026-04-10", 5)).toEqual(["2026-01-10", "2026-02-05", "2026-03-05", "2026-04-05"]);
  });
  it("clamps the due day to short months", () => {
    expect(scheduleDueDates("2026-01-31", "2026-03-15", 31)).toEqual(["2026-01-31", "2026-02-28"]);
  });
  it("splits the booking total automatically, remainder on the last month", () => {
    expect(buildSchedule({ checkIn: "2026-01-01", checkOut: "2026-03-31", dueDay: 1, total: 1000 }).map((i) => i.amount)).toEqual([333.33, 333.33, 333.34]);
  });
  it("uses a manual monthly amount when given", () => {
    expect(buildSchedule({ checkIn: "2026-01-01", checkOut: "2026-03-31", dueDay: 1, total: 1000, monthly: 450 }).map((i) => i.amount)).toEqual([450, 450, 450]);
  });
  it("a partially paid installment past its due date is overdue", () => {
    expect(installmentState(500, 200, "2026-10-01", "2026-10-22")).toBe("overdue");
    expect(installmentState(500, 200, "2026-10-30", "2026-10-22")).toBe("partial");
    expect(installmentState(500, 500, "2026-10-01", "2026-10-22")).toBe("paid");
  });
});
