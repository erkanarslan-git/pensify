import { describe, expect, it } from "vitest";
import { propertyCards, todayMovements, type TodayReservation } from "./dashboard-today";

const T = "2026-11-19";
const r = (o: Partial<TodayReservation>): TodayReservation => ({ id: Math.random().toString(), guest_name: "A", check_in: "2026-11-10", check_out: "2026-11-25", long_stay: false, property_id: "p1", status: "confirmed", ...o });

describe("dashboard today", () => {
  it("splits arrivals and departures and drops cancelled stays", () => {
    const m = todayMovements([r({ check_in: T, guest_name: "Bob" }), r({ check_out: T }), r({ check_in: T, status: "cancelled" })], T);
    expect(m.arrivals.map((x) => x.guest_name)).toEqual(["Bob"]);
    expect(m.departures).toHaveLength(1);
  });
  it("summarises each property separately", () => {
    const [p1, p2] = propertyCards(
      [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }],
      [{ property_id: "p1", status: "occupied" }, { property_id: "p1", status: "available" }, { property_id: "p1", status: "maintenance" }, { property_id: "p1", status: "cleaning_required" }, { property_id: "p2", status: "available" }],
      [r({ long_stay: true }), r({ check_in: T }), r({ property_id: "p2", check_out: T })], T);
    expect(p1).toMatchObject({ total: 4, occupied: 1, available: 1, maintenance: 1, cleaning: 1, longStay: 1, arrivals: 1, departures: 0, rate: 25 });
    expect(p2).toMatchObject({ total: 1, departures: 1, longStay: 0, rate: 0 });
  });
});
