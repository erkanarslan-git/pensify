import { describe, expect, it } from "vitest";
import { maintenanceWorkerAllowed } from "./maintenance-assignment";
describe("maintenance assignment options", () => {
  const workers = [{ user_id: "maintenance-worker", full_name: "Worker" }];
  it("allows an authorized maintenance worker", () => {
    expect(maintenanceWorkerAllowed(workers, "maintenance-worker")).toBe(true);
  });
  it("rejects an employee outside the authorized worker list", () => {
    expect(maintenanceWorkerAllowed(workers, "office-worker")).toBe(false);
  });
  it("allows removing an assignment", () => {
    expect(maintenanceWorkerAllowed(workers, "")).toBe(true);
  });
});