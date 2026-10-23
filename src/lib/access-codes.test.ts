import { expect, it } from "vitest";
import { effectivePermission } from "./permissions";
import { berlinLocalToIso } from "./business-time";
it("viewing and editing access codes are separate explicit permissions", () => {
  expect(effectivePermission("view_access_codes", ["reception"], [], [])).toBe(false);
  expect(effectivePermission("view_access_codes", ["reception"], [], [{ permission: "view_access_codes", allowed: true }])).toBe(true);
  expect(effectivePermission("edit_access_codes", ["reception"], [], [{ permission: "view_access_codes", allowed: true }])).toBe(false);
});
it("access validity uses Berlin winter and summer", () => {
  expect(berlinLocalToIso("2026-01-15T12:30")).toBe("2026-01-15T11:30:00.000Z");
  expect(berlinLocalToIso("2026-07-15T12:30")).toBe("2026-07-15T10:30:00.000Z");
  expect(() => berlinLocalToIso("2026-03-29T02:30")).toThrow();
});