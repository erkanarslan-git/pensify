import { describe, expect, it } from "vitest";
import { shiftNeedsWarning } from "./shift-warning";

describe("long shift warning", () => {
  const start = "2026-10-23T00:00:00Z";
  it("does not warn before the default twelve-hour operational boundary", () => {
    expect(shiftNeedsWarning(start, Date.parse("2026-10-23T11:59:59Z"))).toBe(false);
  });
  it("warns at the configured operational threshold", () => {
    expect(shiftNeedsWarning(start, Date.parse("2026-10-23T14:00:00Z"), 840)).toBe(true);
  });
  it("does not treat invalid timestamps as long shifts", () => {
    expect(shiftNeedsWarning("invalid", Date.parse(start))).toBe(false);
  });
});