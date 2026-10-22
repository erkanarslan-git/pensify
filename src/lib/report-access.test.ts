import { describe, expect, it } from "vitest";
import { reportTeams, effectiveReportTeam, scopedReportItems } from "./report-access";
import type { WorkItem } from "./work-report";
import { canAccessRoute } from "./permissions";

describe("department report access", () => {
  it("report access does not grant admin or other unrelated pages", () => {
    expect(canAccessRoute("/work-report", ["cleaner"], ["cleaning"])).toBe(true);
    expect(canAccessRoute("/work-report", ["cleaner"], [])).toBe(false);
    expect(canAccessRoute("/settings/logs", ["cleaner"], ["cleaning"])).toBe(false);
    expect(canAccessRoute("/team", ["cleaner"], ["cleaning"])).toBe(false);
  });
  it("denies missing and unrecognized grants", () => {
    expect(reportTeams(null)).toEqual([]);
    expect(reportTeams(["hr", "admin"])).toEqual([]);
    expect(effectiveReportTeam("all", [])).toBeNull();
  });
  it("a cleaning lead cannot select an all or office report", () => {
    expect(effectiveReportTeam("all", ["cleaning"])).toBe("cleaning");
    expect(effectiveReportTeam("office", ["cleaning"])).toBe("cleaning");
  });
  it("multiple department grants stay separate", () => {
    expect(reportTeams(["maintenance", "cleaning"])).toEqual(["cleaning", "maintenance"]);
    expect(effectiveReportTeam("maintenance", ["cleaning", "maintenance"])).toBe("maintenance");
  });
  it("other department records cannot enter totals or exports", () => {
    const items = ["res_new", "clean_done", "issue_done", "todo_done"].map((topic) => ({ topic }) as WorkItem);
    expect(scopedReportItems(items, ["cleaning"]).map((i) => i.topic)).toEqual(["clean_done"]);
    expect(scopedReportItems(items, ["maintenance"]).map((i) => i.topic)).toEqual(["issue_done"]);
    expect(scopedReportItems(items, ["all"])).toHaveLength(4);
  });
});