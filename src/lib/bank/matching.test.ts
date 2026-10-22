import { describe, expect, it } from "vitest";
import { decideMatch, extractReferences, maskIban, type BankTx, type OpenInstallment } from "./matching";

const inst = (o: Partial<OpenInstallment> = {}): OpenInstallment => ({
  id: "s1", reservationId: "r1", reference: "PH-AB12CD", remaining: 500, currency: "EUR", kind: "rent", payerIbans: [], ...o,
});
const tx = (o: Partial<BankTx> = {}): BankTx => ({ amount: 500, currency: "EUR", bookingStatus: "booked", remittance: "Miete PH-AB12CD", counterpartyIban: null, ...o });

describe("bank matching", () => {
  it("reads references written loosely", () => {
    expect(extractReferences("miete ph ab12cd oktober")).toEqual(["PH-AB12CD"]);
  });
  it("a pending transaction never settles a debt", () => {
    expect(decideMatch(tx({ bookingStatus: "pending" }), [inst()])).toEqual({ kind: "none" });
  });
  it("unique reference + booked settles automatically", () => {
    expect(decideMatch(tx(), [inst()])).toEqual({ kind: "auto", allocations: [{ scheduleId: "s1", amount: 500 }], unallocated: 0 });
  });
  it("partial payment closes only its amount", () => {
    expect(decideMatch(tx({ amount: 200 }), [inst()])).toMatchObject({ kind: "auto", allocations: [{ amount: 200 }] });
  });
  it("overpayment keeps the rest as unallocated balance", () => {
    expect(decideMatch(tx({ amount: 650 }), [inst()])).toMatchObject({ allocations: [{ amount: 500 }], unallocated: 150 });
  });
  it("multiple periods auto-split only on exact total, otherwise review", () => {
    const two = [inst(), inst({ id: "s2", reference: "PH-ZZ99YY" })];
    expect(decideMatch(tx({ amount: 1000, remittance: "PH-AB12CD PH-ZZ99YY" }), two).kind).toBe("auto");
    expect(decideMatch(tx({ amount: 700, remittance: "PH-AB12CD PH-ZZ99YY" }), two)).toMatchObject({ kind: "review", reason: "multiple" });
  });
  it("same name or same amount without reference is never auto-paid", () => {
    expect(decideMatch(tx({ remittance: "Miete Max Mustermann" }), [inst()]).kind).toBe("none");
    expect(decideMatch(tx({ remittance: "Miete", counterpartyIban: "DE89 3704 0044 0532 0130 00" }), [inst({ payerIbans: ["DE89370400440532013000"] })]))
      .toMatchObject({ kind: "review", reason: "no_reference" });
  });
  it("deposits and other currencies go to review", () => {
    expect(decideMatch(tx(), [inst({ kind: "deposit" })])).toMatchObject({ kind: "review", reason: "deposit" });
    expect(decideMatch(tx({ currency: "CHF" }), [inst()])).toMatchObject({ kind: "review", reason: "currency" });
  });
  it("refunds/outgoing go to review", () => {
    expect(decideMatch(tx({ amount: -500 }), [inst()])).toMatchObject({ kind: "review", reason: "outgoing" });
  });
  it("masks IBAN by default", () => {
    expect(maskIban("DE89 3704 0044 0532 0130 00")).toBe("DE89 •••• 3000");
  });
});
