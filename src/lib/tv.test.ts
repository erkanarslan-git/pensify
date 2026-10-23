import { describe, expect, it } from "vitest";
import { newTvEvents, tvDeltas, tvSnapshotSchema, tvTokenSchema } from "./tv";

const event = { id: "event-1", at: "2026-10-23T00:00:00Z", kind: "reservation_created" as const, source: "booking" };
const totals = { total: 84, occupied: 3, ready: 78, cleaning: 3, maintenance: 0, arrivals: 2, departures: 1, created: 1 };
const snapshot = { organization: "Test", at: event.at, day: "2026-10-23", totals, properties: [], weekly: [], events: [event], dues: { overdue: 0, dueToday: 0, dueWeek: 0 }, colors: { booking: "#003580" } };
describe("TV safety and updates", () => {
  it("rejects personal fields in the response", () => {
    expect(tvSnapshotSchema.safeParse({ ...snapshot, guest_name: "private" }).success).toBe(false);
    expect(tvSnapshotSchema.safeParse({ ...snapshot, events: [{ ...event, guest_phone: "private" }] }).success).toBe(false);
    expect(tvSnapshotSchema.safeParse({ ...snapshot, properties: [{ name: "Test", ...totals, access_code: "private" }] }).success).toBe(false);
    expect(tvSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
  it("never sounds initial or reconnect snapshots", () => {
    expect(newTvEvents(null, [event])).toEqual([]);
    expect(newTvEvents([], [event], true)).toEqual([]);
  });
  it("deduplicates IDs and ignores previously seen events", () => {
    expect(newTvEvents([], [event, event])).toHaveLength(1);
    expect(newTvEvents([event.id], [event])).toEqual([]);
  });
  it("uses last snapshot changes, not period comparisons", () => {
    expect(tvDeltas(totals, { ...totals, ready: 79, cleaning: 2 })).toMatchObject({ ready: 1, cleaning: -1, occupied: 0 });
    expect(tvDeltas(null, totals).ready).toBe(0);
  });
  it("accepts only the full display token", () => {
    expect(tvTokenSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(tvTokenSchema.safeParse("a".repeat(63)).success).toBe(false);
    expect(tvTokenSchema.safeParse("https://outside.test").success).toBe(false);
  });
});