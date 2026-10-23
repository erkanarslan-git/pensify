import { describe, expect, it } from "vitest";
import { cleaningNeedsReview, validCleaningReason, validIssue } from "./cleaning-inspection";
describe("cleaning inspection rules", () => {
  it("problems are not pending inspection", () => {
    expect(cleaningNeedsReview({ status: "problem", inspection_state: "not_required" })).toBe(false);
  });
  it("finished work awaits inspection only when required", () => {
    expect(cleaningNeedsReview({ status: "completed", inspection_state: "pending" })).toBe(true);
    expect(cleaningNeedsReview({ status: "completed", inspection_state: "not_required" })).toBe(false);
    expect(cleaningNeedsReview({ status: "completed", inspection_state: "approved" })).toBe(false);
  });
  it("reopening and rejection require a reason", () => {
    expect(validCleaningReason("  ")).toBe(false);
    expect(validCleaningReason("Yeniden kontrol")).toBe(true);
  });
  it("category alone is sufficient for reporting including door locks", () => {
    expect(validIssue("lock", "")).toBe(true);
    expect(validIssue("other", "")).toBe(true);
    expect(validIssue("unknown", "")).toBe(false);
    expect(validIssue("damage", "x".repeat(2001))).toBe(false);
  });
});