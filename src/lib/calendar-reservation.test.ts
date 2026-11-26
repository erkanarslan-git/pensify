import { describe, expect, it } from "vitest";
import { calendarReservationColors, hasOpenPayment } from "./calendar-reservation";

describe("calendar reservation presentation", () => {
  it("uses one identical color for every long-stay guest", () => {
    const a = calendarReservationColors({ longStay: true, guestName: "A", status: "checked_in" });
    const b = calendarReservationColors({ longStay: true, guestName: "B" });
    expect(a).toEqual(b);
    expect(a.bg).toBe("var(--long-stay-surface)");
  });

  it("colors by status, not by guest name", () => {
    expect(calendarReservationColors({ longStay: false, guestName: "A" })).toEqual(calendarReservationColors({ longStay: false, guestName: "Z" }));
    expect(calendarReservationColors({ longStay: false, guestName: "A", status: "checked_in" }).bg).toBe("var(--stay-inhouse-surface)");
    expect(calendarReservationColors({ longStay: false, guestName: "A", status: "checked_out" }).bg).toBe("var(--stay-done-surface)");
    expect(calendarReservationColors({ longStay: false, guestName: "A", status: "confirmed" }).bg).toBe("var(--stay-booked-surface)");
  });

  it("shows the payment warning only for an unpaid reservation", () => {
    expect(hasOpenPayment("open")).toBe(true);
    expect(hasOpenPayment("partial")).toBe(false);
    expect(hasOpenPayment("paid")).toBe(false);
    expect(hasOpenPayment(undefined)).toBe(false);
  });
});
