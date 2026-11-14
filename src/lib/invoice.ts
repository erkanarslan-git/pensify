export interface InvoiceItem { description: string; quantity: number; unit_price: number; vat_rate: number }
export interface InvoiceIssuer { company_name?: string | null; address?: string | null; tax_number?: string | null; vat_id?: string | null; email?: string | null; phone?: string | null; bank_name?: string | null; iban?: string | null; bic?: string | null; footer_note?: string | null }
export interface InvoiceDoc { invoice_number: string; issue_date: string; recipient_name: string; recipient_address?: string | null; items: (InvoiceItem & { total?: number })[]; net_total: number; vat_total: number; gross_total: number; issuer: InvoiceIssuer; note?: string | null; stay?: string | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Prices are gross (VAT included), as usual for German accommodation. Mirrors create_invoice. */
export function invoiceTotals(items: InvoiceItem[]) {
  let gross = 0, vat = 0;
  const byRate = new Map<number, { net: number; vat: number }>();
  for (const it of items) {
    const line = r2(it.quantity * it.unit_price);
    const v = r2(line - line / (1 + it.vat_rate / 100));
    gross += line; vat += v;
    const cur = byRate.get(it.vat_rate) ?? { net: 0, vat: 0 };
    byRate.set(it.vat_rate, { net: r2(cur.net + line - v), vat: r2(cur.vat + v) });
  }
  return { gross: r2(gross), vat: r2(vat), net: r2(gross - vat), byRate: [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, x]) => ({ rate, ...x })) };
}

export function formatInvoiceNumber(format: string, year: number, n: number) {
  return format.replace("{YYYY}", String(year)).replace("{YY}", String(year % 100).padStart(2, "0"))
    .replace("{NNNNN}", String(n).padStart(5, "0")).replace("{NNNN}", String(n).padStart(4, "0")).replace("{NNN}", String(n).padStart(3, "0"));
}

/** Next number preview; yearly reset only when the format contains the year. */
export function nextInvoiceNumber(s: { number_format: string; next_number: number; number_year: number | null }, year: number) {
  const n = s.number_year != null && s.number_year !== year && s.number_format.includes("{YY") ? 1 : s.next_number;
  return formatInvoiceNumber(s.number_format, year, n);
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const de = (d: string) => d.split("-").reverse().join(".");

export function invoiceHtml(doc: InvoiceDoc) {
  const i = doc.issuer; const t = invoiceTotals(doc.items);
  const rows = doc.items.map((it) => `<tr><td>${esc(it.description)}</td><td class="n">${esc(it.quantity)}</td><td class="n">${eur(it.unit_price)}</td><td class="n">${esc(it.vat_rate)} %</td><td class="n">${eur(r2(it.quantity * it.unit_price))}</td></tr>`).join("");
  const vatRows = t.byRate.map((x) => `<tr><td colspan="4" class="n">Netto (${x.rate} %)</td><td class="n">${eur(x.net)}</td></tr><tr><td colspan="4" class="n">MwSt. ${x.rate} %</td><td class="n">${eur(x.vat)}</td></tr>`).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${esc(doc.invoice_number)}</title><style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:40px;font-size:13px}h1{font-size:22px;margin:24px 0 4px}.top{display:flex;justify-content:space-between;gap:24px}
.muted{color:#555}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:6px 4px;border-bottom:1px solid #ddd;text-align:left}.n{text-align:right}
.sum td{font-weight:bold;border-top:2px solid #111}footer{margin-top:40px;font-size:11px;color:#555;border-top:1px solid #ddd;padding-top:8px;white-space:pre-line}@media print{body{margin:15mm}}
</style></head><body>
<div class="top"><div><div class="muted" style="font-size:11px">${esc(i.company_name)} · ${esc((i.address ?? "").replace(/\n/g, ", "))}</div><p style="white-space:pre-line;margin-top:12px"><strong>${esc(doc.recipient_name)}</strong>\n${esc(doc.recipient_address)}</p></div>
<div style="text-align:right;white-space:pre-line"><strong>${esc(i.company_name)}</strong>\n${esc(i.address)}\n${esc(i.phone)}\n${esc(i.email)}</div></div>
<h1>Rechnung</h1><div>Rechnungsnr.: <strong>${esc(doc.invoice_number)}</strong> · Datum: ${de(doc.issue_date)}${doc.stay ? ` · Leistungszeitraum: ${esc(doc.stay)}` : ""}</div>
<table><thead><tr><th>Beschreibung</th><th class="n">Menge</th><th class="n">Einzelpreis</th><th class="n">MwSt.</th><th class="n">Gesamt</th></tr></thead><tbody>${rows}${vatRows}
<tr class="sum"><td colspan="4" class="n">Gesamtbetrag</td><td class="n">${eur(t.gross)}</td></tr></tbody></table>
${doc.note ? `<p style="white-space:pre-line;margin-top:20px">${esc(doc.note)}</p>` : ""}
<footer>${[i.company_name, i.tax_number && `Steuernr.: ${i.tax_number}`, i.vat_id && `USt-IdNr.: ${i.vat_id}`, i.bank_name, i.iban && `IBAN: ${i.iban}`, i.bic && `BIC: ${i.bic}`].filter(Boolean).map(esc).join(" · ")}${i.footer_note ? `\n${esc(i.footer_note)}` : ""}</footer>
</body></html>`;
}

export function printInvoice(doc: InvoiceDoc) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(invoiceHtml(doc)); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

export function invoiceMailto(doc: InvoiceDoc, email: string) {
  const subject = `Rechnung ${doc.invoice_number}`;
  const body = `Guten Tag ${doc.recipient_name},\n\nanbei erhalten Sie unsere Rechnung ${doc.invoice_number} vom ${de(doc.issue_date)} über ${eur(doc.gross_total)}.\n\nMit freundlichen Grüßen\n${doc.issuer.company_name ?? ""}`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
