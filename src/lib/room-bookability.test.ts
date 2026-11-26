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
import { roomChoiceState, roomTypeCode } from "./room-bookability";
describe("room choice labels", () => {
  const room = { id: "r1", property_id: "p", active: true, status: "available" };
  it("marks a room already chosen in another line for overlapping dates", () => {
    expect(roomChoiceState(room, "2026-12-01", "2026-12-05", [], [{ roomId: "r1", checkIn: "2026-12-03", checkOut: "2026-12-04" }])).toBe("picked");
    expect(roomChoiceState(room, "2026-12-01", "2026-12-05", [], [{ roomId: "r1", checkIn: "2026-12-05", checkOut: "2026-12-07" }])).toBe("free");
  });
  it("marks booked rooms as occupied", () => {
    expect(roomChoiceState(room, "2026-12-01", "2026-12-05", [{ id: "x", room_id: "r1", check_in: "2026-11-30", check_out: "2026-12-02", status: "confirmed", deleted_at: null }], [])).toBe("occupied");
  });
  it("uses EZ, DZ and numbered DZ codes for room capacity", () => {
    expect(roomTypeCode(1)).toBe("EZ");
    expect(roomTypeCode(2)).toBe("DZ");
    expect(roomTypeCode(3)).toBe("3DZ");
    expect(roomTypeCode(4)).toBe("4DZ");
    expect(roomTypeCode(null)).toBe("Zimmer");
  });
});
