import { describe, expect, it } from "vitest";
import { effectiveCheckOut, isOpenEndedCheckOut, OPEN_ENDED_CHECK_OUT } from "./open-stay";

describe("open-ended stays", () => {
  it("does not require a checkout date for a long-stay guest", () => {
    expect(effectiveCheckOut(true, "2026-12-01")).toBe(OPEN_ENDED_CHECK_OUT);
    expect(isOpenEndedCheckOut(OPEN_ENDED_CHECK_OUT)).toBe(true);
  });

  it("keeps an ordinary checkout unchanged", () => {
    expect(effectiveCheckOut(false, "2026-12-01")).toBe("2026-12-01");
  });
});
