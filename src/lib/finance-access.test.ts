import { describe, expect, it } from "vitest";
import { canAccessRoute, effectivePermission } from "./permissions";

describe("explicit finance authorization", () => {
  const keys = ["view_finance", "collect_payments", "correct_payments", "manage_payment_plans", "manage_bank", "match_payments"];
  it("owner retains each operation in the resolved organization", () => {
    for (const key of keys) expect(effectivePermission(key, ["owner"], [], [])).toBe(true);
  });
  it("admin, manager and reception roles alone grant no finance operation", () => {
    for (const role of ["admin", "manager", "reception"] as const)
      for (const key of keys) expect(effectivePermission(key, [role], [], [])).toBe(false);
  });
  it("view grant does not grant collection, corrections or bank management", () => {
    const overrides = [{ permission: "view_finance", allowed: true }];
    expect(effectivePermission("view_finance", ["reception"], [], overrides)).toBe(true);
    for (const key of keys.filter((k) => k !== "view_finance")) expect(effectivePermission(key, ["reception"], [], overrides)).toBe(false);
  });
  it("individual denial overrides an explicit role collection grant", () => {
    expect(effectivePermission("collect_payments", ["admin"], [{ role: "admin", permission: "collect_payments", allowed: true }], [{ permission: "collect_payments", allowed: false }])).toBe(false);
  });
  it("role denial overrides the catalog default", () => {
    expect(effectivePermission("view_calendar", ["reception"], [{ role: "reception", permission: "view_calendar", allowed: false }], [])).toBe(false);
  });
  it("finance pages require view permission and bank settings require bank permission", () => {
    expect(canAccessRoute("/payments", ["admin"])).toBe(false);
    expect(canAccessRoute("/analytics", ["admin"])).toBe(false);
    expect(canAccessRoute("/payments", ["reception"], [], false, (key) => key === "view_finance")).toBe(true);
    expect(canAccessRoute("/payments/bank", ["reception"], [], false, (key) => key === "view_finance")).toBe(false);
    expect(canAccessRoute("/payments/bank", ["reception"], [], false, (key) => key === "manage_bank")).toBe(true);
  });
  it("an unassigned account cannot use individual grants", () => {
    expect(effectivePermission("view_finance", [], [], [{ permission: "view_finance", allowed: true }])).toBe(false);
  });
});