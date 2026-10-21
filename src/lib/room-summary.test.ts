import { describe, expect, it } from "vitest";
import { summarizeRooms } from "./room-summary";

describe("operational room summaries", () => {
  it("returns a completed clean room to available, not the yellow cleaning total", () => {
    const before = summarizeRooms([{ status: "cleaning_in_progress" }]);
    const after = summarizeRooms([{ status: "cleaned" }]);
    expect(before.cleaning).toBe(1);
    expect(before.available).toBe(0);
    expect(after.cleaning).toBe(0);
    expect(after.available).toBe(1);
  });
  it("counts each occupied room once, including today's departures", () => {
    expect(summarizeRooms([{ status: "occupied" }, { status: "checkout_today" }, { status: "available" }]).occupied).toBe(2);
  });
  it("separates two waiting rooms from one cleaning in progress", () => {
    const summary = summarizeRooms([{ status: "cleaning_required" }, { status: "cleaning_required" }, { status: "cleaning_in_progress" }]);
    expect(summary.cleaningPending).toBe(2);
    expect(summary.cleaningInProgress).toBe(1);
    expect(summary.cleaning).toBe(3);
  });
  it("partitions the 84-room inventory without double counting", () => {
    const rooms = [
      ...Array.from({ length: 78 }, () => ({ status: "available" })),
      ...Array.from({ length: 3 }, () => ({ status: "occupied" })),
      { status: "cleaning_required" }, { status: "cleaning_required" }, { status: "cleaning_in_progress" },
    ];
    const summary = summarizeRooms(rooms);
    expect(summary.total).toBe(84);
    expect(summary.occupied + summary.available + summary.cleaning + summary.maintenance).toBe(84);
  });
});