import { describe, expect, it } from "vitest";
import { BUSINESS_TIME_ZONE, businessDate, businessTime, businessDayBounds } from "./business-time";

describe("Germany business time everywhere", () => {
  it("fixes the business timezone to Europe/Berlin", () => {
    expect(BUSINESS_TIME_ZONE).toBe("Europe/Berlin");
  });
  it("uses German summer and winter clock time, not Istanbul", () => {
    expect(businessTime(new Date("2026-10-21T06:00:00Z"))).toBe("08:00");
    expect(businessTime(new Date("2026-12-21T07:00:00Z"))).toBe("08:00");
    expect(businessDate(new Date("2026-10-20T22:30:00Z"))).toBe("2026-10-21");
  });
  it("selects Germany's complete day including daylight-saving transitions", () => {
    expect(businessDayBounds("2026-10-21")).toEqual({ start: "2026-10-20T22:00:00.000Z", end: "2026-10-21T22:00:00.000Z" });
    expect(businessDayBounds("2026-10-25")).toEqual({ start: "2026-10-24T22:00:00.000Z", end: "2026-10-25T23:00:00.000Z" });
    expect(businessDayBounds("2026-03-29")).toEqual({ start: "2026-03-28T23:00:00.000Z", end: "2026-03-29T22:00:00.000Z" });
  });
});