import { describe, expect, it } from "vitest";
import { canBookRoom } from "./room-bookability";

const room = { id: "r", property_id: "p", active: true, status: "available" };
const stay = { id: "s", room_id: "r", check_in: "2026-10-21", check_out: "2026-10-23", status: "confirmed", deleted_at: null };
describe("reservation room selection", () => {
  it("excludes maintenance rooms", () => expect(canBookRoom({ ...room, status: "maintenance" }, "2026-10-21", "2026-10-22", [])).toBe(false));
  it("excludes inactive rooms", () => expect(canBookRoom({ ...room, active: false }, "2026-10-21", "2026-10-22", [])).toBe(false));
  it("excludes rooms booked during selected dates", () => expect(canBookRoom(room, "2026-10-22", "2026-10-24", [stay])).toBe(false));
  it("allows arrival on previous checkout day", () => expect(canBookRoom(room, "2026-10-23", "2026-10-24", [stay])).toBe(true));
  it("ignores cancelled, no-show and trashed stays", () => {
    for (const ignored of [{ ...stay, status: "cancelled" }, { ...stay, status: "no_show" }, { ...stay, deleted_at: "2026-10-20" }])
      expect(canBookRoom(room, "2026-10-21", "2026-10-22", [ignored])).toBe(true);
  });
  it("excludes the reservation being edited, not another booking", () => {
    expect(canBookRoom(room, "2026-10-21", "2026-10-22", [stay], "s")).toBe(true);
    expect(canBookRoom(room, "2026-10-21", "2026-10-22", [stay], "other")).toBe(false);
  });
});