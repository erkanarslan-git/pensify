import { describe, expect, it } from "vitest";
import { addDaysIso, localIso, nightsBetween, parseLocalIso } from "./calendar-date";

describe("calendar dates", () => {
  it("chosen day 29.10 stays 29.10", () => {
    expect(localIso(parseLocalIso("2026-10-29"))).toBe("2026-10-29");
  });
  it("30.10 to 01.11 is 2 nights, across DST change", () => {
    expect(nightsBetween("2026-10-30", "2026-11-01")).toBe(2);
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
  });
});
