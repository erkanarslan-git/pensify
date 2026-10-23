import { expect, it } from "vitest";
import { canAccessRoute } from "./permissions";
it("workers cannot open time management without an explicit scoped grant", () => { expect(canAccessRoute("/time-tracking", ["cleaner"])).toBe(false); });
it("an authorized lead can open the scoped time management screen", () => { expect(canAccessRoute("/time-tracking", ["cleaner"], [], true)).toBe(true); });
it("owners and admins retain time management access", () => { expect(canAccessRoute("/time-tracking", ["owner"])).toBe(true); expect(canAccessRoute("/time-tracking", ["admin"])).toBe(true); });