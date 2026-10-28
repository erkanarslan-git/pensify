import { describe, expect, it } from "vitest";
import { canAccessRoute } from "./permissions";
describe("Pensionen page access", () => {
  it("manager without the permission cannot open locations", () => {
    expect(canAccessRoute("/properties", ["manager"], [], false, () => false)).toBe(false);
  });
  it("manager granted view_properties can open locations", () => {
    expect(canAccessRoute("/properties", ["manager"], [], false, (k) => k === "view_properties")).toBe(true);
  });
});
