import { describe, expect, it } from "vitest";
import { isMorningDigestTime, morningDigestBody } from "./morning-digest";

describe("morning digest", () => {
  it("does not notify employees with no tasks", () => expect(morningDigestBody(0, 0)).toBeNull());
  it("includes today's and overdue counts", () => expect(morningDigestBody(3, 2, "tr")).toBe("Günaydın! Bugün 3 göreviniz var. Geciken görev: 2."));
  it("notifies when there are only overdue tasks", () => expect(morningDigestBody(0, 2, "en")).toBe("Good morning! You have 0 tasks today. Overdue tasks: 2."));
  it("uses 08:00 Berlin in winter", () => {
    expect(isMorningDigestTime(new Date("2026-10-28T07:00:00Z"))).toBe(true);
    expect(isMorningDigestTime(new Date("2026-10-28T06:00:00Z"))).toBe(false);
  });
  it("uses 08:00 Berlin in summer including DST transition day", () => {
    expect(isMorningDigestTime(new Date("2026-03-29T06:00:00Z"))).toBe(true);
    expect(isMorningDigestTime(new Date("2026-03-29T07:00:00Z"))).toBe(false);
  });
});