import { describe, it, expect } from "vitest";
import { invoiceTotals, formatInvoiceNumber, nextInvoiceNumber, invoiceHtml } from "./invoice";

describe("invoice", () => {
  it("extracts 7% VAT from gross prices", () => {
    const t = invoiceTotals([{ description: "Übernachtung", quantity: 3, unit_price: 50, vat_rate: 7 }]);
    expect(t.gross).toBe(150); expect(t.vat).toBe(9.81); expect(t.net).toBe(140.19);
  });
  it("uses year + sequence number", () => {
    expect(formatInvoiceNumber("{YYYY}-{NNNN}", 2026, 1)).toBe("2026-0001");
  });
  it("restarts sequence in a new year", () => {
    expect(nextInvoiceNumber({ number_format: "{YYYY}-{NNNN}", next_number: 57, number_year: 2026 }, 2027)).toBe("2027-0001");
    expect(nextInvoiceNumber({ number_format: "{YYYY}-{NNNN}", next_number: 57, number_year: 2026 }, 2026)).toBe("2026-0057");
  });
  it("escapes guest names in the document", () => {
    const html = invoiceHtml({ invoice_number: "1", issue_date: "2026-01-02", recipient_name: "<b>x</b>", items: [], net_total: 0, vat_total: 0, gross_total: 0, issuer: {} });
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("net-price invoices", () => {
  it("adds 7% VAT on top of net prices (Rechnung 20260576 example)", () => {
    const t = invoiceTotals([
      { description: "Unterkunft", quantity: 35, unit_price: 200, vat_rate: 7 },
      { description: "Beherbergungssteuer", quantity: 1, unit_price: 104.86, vat_rate: 7 },
    ], true);
    expect(t.net).toBe(7104.86);
    expect(t.vat).toBe(497.34);
    expect(t.gross).toBe(7602.2);
  });
});
