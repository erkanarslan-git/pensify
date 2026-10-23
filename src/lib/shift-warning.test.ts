import { describe, expect, it } from "vitest";
import { shiftNeedsWarning } from "./shift-warning";

describe("long shift warning", () => {
  const start = "2026-10-23T00:00:00Z";
  it("does not warn at the existing 16 hour boundary", () => {
    expect(shiftNeedsWarning(start, Date.parse("2026-10-23T16:00:00Z"))).toBe(false);
  });
  it("warns after 16 hours, regardless of the calendar day", () => {
    expect(shiftNeedsWarning(start, Date.parse("2026-10-23T16:00:01Z"))).toBe(true);
  });
  it("does not treat invalid timestamps as long shifts", () => {
    expect(shiftNeedsWarning("invalid", Date.parse(start))).toBe(false);
  });
});