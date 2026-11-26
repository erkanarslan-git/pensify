import { describe, expect, it } from "vitest";
import { calendarReservationColors, hasOpenPayment } from "./calendar-reservation";

describe("calendar reservation presentation", () => {
  it("uses one identical color for every long-stay guest", () => {
    const a = calendarReservationColors({ longStay: true, guestName: "A" }, { bg: "red", fg: "black" });
    const b = calendarReservationColors({ longStay: true, guestName: "B" }, { bg: "blue", fg: "white" });
    expect(a).toEqual(b);
    expect(a.bg).toBe("var(--long-stay-surface)");
  });

  it("shows the payment warning only for an unpaid reservation", () => {
    expect(hasOpenPayment("open")).toBe(true);
    expect(hasOpenPayment("partial")).toBe(false);
    expect(hasOpenPayment("paid")).toBe(false);
    expect(hasOpenPayment(undefined)).toBe(false);
  });
});
