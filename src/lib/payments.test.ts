import { describe, expect, it } from "vitest";
import { buildSchedule, buildReplacementSchedule, validReplacementSchedule, installmentState, scheduleDueDates } from "./payments";

describe("payment plans", () => {
  const stay = { checkIn: "2026-01-01", checkOut: "2026-03-31", dueDay: 1, total: 1500 };
  it("does not recreate a paid month and keeps total debt at the reservation total", () => {
    const retained = [{ due_date: "2026-01-01", amount: 500 }];
    const replacement = buildReplacementSchedule(stay, retained);
    expect(replacement).toEqual([{ due_date: "2026-02-01", amount: 500 }, { due_date: "2026-03-01", amount: 500 }]);
    expect([...retained, ...replacement].reduce((sum, r) => sum + r.amount, 0)).toBe(1500);
  });
  it("retains the full obligation of a partially paid installment", () => {
    expect(buildReplacementSchedule(stay, [{ due_date: "2026-01-01", amount: 600 }]).map((r) => r.amount)).toEqual([450, 450]);
  });
  it("does not recreate protected months when the payment day changes", () => {
    expect(buildReplacementSchedule({ ...stay, dueDay: 15 }, [{ due_date: "2026-02-01", amount: 500 }]).map((r) => r.due_date)).toEqual(["2026-01-01", "2026-03-15"]);
  });
  it("keeps manual monthly amounts only for unprotected months", () => {
    expect(buildReplacementSchedule({ ...stay, monthly: 450 }, [{ due_date: "2026-01-01", amount: 500 }]).map((r) => r.amount)).toEqual([450, 450]);
  });
  it("allows a fully protected plan with no additional installments", () => {
    const retained = buildSchedule(stay);
    expect(buildReplacementSchedule(stay, retained)).toEqual([]);
    expect(validReplacementSchedule([], retained)).toBe(true);
  });
  it("rejects edited installments in protected months and duplicate months", () => {
    expect(validReplacementSchedule([{ due_date: "2026-01-20", amount: 500 }], [{ due_date: "2026-01-01", amount: 500 }])).toBe(false);
    expect(validReplacementSchedule([{ due_date: "2026-02-01", amount: 500 }, { due_date: "2026-02-15", amount: 500 }], [])).toBe(false);
  });
  it("allocates remaining cents exactly and creates no debt when retained amounts cover the total", () => {
    expect(buildReplacementSchedule({ ...stay, total: 1000 }, [{ due_date: "2026-01-01", amount: 333.33 }]).map((r) => r.amount)).toEqual([333.33, 333.34]);
    expect(buildReplacementSchedule(stay, [{ due_date: "2026-01-01", amount: 1500 }])).toEqual([]);
  });
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
