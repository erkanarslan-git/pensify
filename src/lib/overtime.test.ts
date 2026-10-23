import { describe, expect, it } from "vitest";
import { overtimePay } from "./overtime";
describe("approved overtime", () => {
  it("without approval all hours remain normal hours", () => {
    expect(overtimePay(600, 0, 12, 20)).toEqual({ regularMinutes: 600, overtimeMinutes: 0, regularAmount: 120, overtimeAmount: 0, amount: 120 });
  });
  it("uses the personal overtime rate without double counting", () => {
    expect(overtimePay(600, 120, 12, 20)).toEqual({ regularMinutes: 480, overtimeMinutes: 120, regularAmount: 96, overtimeAmount: 40, amount: 136 });
  });
  it("cannot approve more time than worked", () => { expect(() => overtimePay(60, 61, 12, 20)).toThrow(); });
  it("rejects negative rates", () => { expect(() => overtimePay(60, 30, 12, -1)).toThrow(); });
});