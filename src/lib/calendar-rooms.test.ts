import { describe, expect, it } from "vitest";
import { calendarFloorTone, compareCalendarRooms } from "./calendar-rooms";

describe("calendar room ordering", () => {
  it("keeps floors together and sorts room numbers naturally", () => {
    const rooms = [
      { id: "4", number: "10", floor: 1 },
      { id: "3", number: "2", floor: 1 },
      { id: "2", number: "102", floor: 0 },
      { id: "1", number: "101", floor: 0 },
      { id: "5", number: "Ohne", floor: null },
    ];
    expect(rooms.sort(compareCalendarRooms).map((room) => room.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("assigns different adjacent floor tones and a neutral unassigned tone", () => {
    expect([calendarFloorTone(0), calendarFloorTone(1), calendarFloorTone(2)]).toEqual([1, 2, 3]);
    expect(calendarFloorTone(null)).toBe(0);
    expect(calendarFloorTone(-1)).toBe(6);
  });
});
