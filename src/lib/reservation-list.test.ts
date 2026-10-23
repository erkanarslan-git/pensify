import { describe, expect, it } from "vitest";
import { applyReservationFilters, calendarWindow, collectReservationExport, orderReservations, reservationCsvCell, reservationFiltersSchema, reservationPageRange, reservationPageSchema, reservationSearchPattern } from "./reservation-list";

function builder() {
  const calls: unknown[][] = [];
  const q: any = {};
  for (const method of ["is", "eq", "in", "gte", "lte", "lt", "or", "order"]) q[method] = (...args: unknown[]) => { calls.push([method, ...args]); return q; };
  return { q, calls };
}
describe("Reservation database pagination", () => {
  it("accepts exactly 10/20/30/40/50 entries per page", () => {
    for (const pageSize of [10, 20, 30, 40, 50]) expect(reservationPageSchema.parse({ pageSize }).pageSize).toBe(pageSize);
    expect(reservationPageSchema.safeParse({ pageSize: 25 }).success).toBe(false);
  });
  it("requests the second twenty-row page without overlap", () => { expect(reservationPageRange(1, 20)).toEqual([20, 39]); });
  it("uses Berlin day bounds for created-today even on a DST day", () => {
    const { q, calls } = builder();
    applyReservationFilters(q, reservationFiltersSchema.parse({ createdTodayOnly: true }), "2026-10-25");
    expect(calls).toContainEqual(["gte", "created_at", "2026-10-24T22:00:00.000Z"]);
    expect(calls).toContainEqual(["lt", "created_at", "2026-10-25T23:00:00.000Z"]);
  });
  it("shares literal name/company/room search and date/property/status/source filters", () => {
    const { q, calls } = builder();
    const id = "00000000-0000-4000-8000-000000000001";
    applyReservationFilters(q, reservationFiltersSchema.parse({ search: "Test", propertyId: id, status: "confirmed", source: "website", from: "2026-10-01", to: "2026-10-31", period: "past" }), "2026-10-23", [id]);
    expect(calls).toContainEqual(["is", "deleted_at", null]);
    expect(calls).toContainEqual(["eq", "property_id", id]);
    expect(calls).toContainEqual(["eq", "status", "confirmed"]);
    expect(calls).toContainEqual(["in", "channel", ["website", "woocommerce"]]);
    expect(calls).toContainEqual(["lt", "check_out", "2026-10-23"]);
    expect(calls).toContainEqual(["gte", "check_in", "2026-10-01"]);
    expect(calls).toContainEqual(["lte", "check_in", "2026-10-31"]);
    expect(calls).toContainEqual(["or", `guest_name.ilike."%Test%",company_name.ilike."%Test%",room_id.in.(${id})`]);
  });
  it("adds a unique id tie-breaker before pagination", () => {
    const { q, calls } = builder(); orderReservations(q, "arrivalDesc");
    expect(calls).toEqual([["order", "check_in", { ascending: false }], ["order", "id", { ascending: true }]]);
  });
  it("exports all 1234 matching records rather than the first 1000 or visible page", async () => {
    const source = Array.from({ length: 1234 }, (_, i) => i);
    expect(await collectReservationExport(async (offset, size) => source.slice(offset, offset + size))).toEqual(source);
  });
  it("does not treat punctuation or wildcards as query grammar", () => {
    expect(reservationSearchPattern('a,b%_"')).toBe('"%a,b\\%\\_\\"%"');
  });
  it("escapes CSV formulas, quotes and multiline values", () => {
    expect(reservationCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(reservationCsvCell('a"b\nc')).toBe('"a""b\nc"');
  });
  it("limits a seven-day calendar window to an exclusive eighth-day bound", () => {
    expect(calendarWindow("2026-10-23", 7)).toEqual({ start: "2026-10-23", end: "2026-10-30" });
  });
});