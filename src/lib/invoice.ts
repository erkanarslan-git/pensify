export interface InvoiceItem { description: string; quantity: number; unit_price: number; vat_rate: number; unit?: string; article_no?: string; pos?: number }
export interface InvoiceIssuer { company_name?: string | null; address?: string | null; tax_number?: string | null; vat_id?: string | null; email?: string | null; phone?: string | null; bank_name?: string | null; iban?: string | null; bic?: string | null; footer_note?: string | null }
export interface InvoiceDoc { invoice_number: string; issue_date: string; recipient_name: string; recipient_address?: string | null; items: (InvoiceItem & { total?: number })[]; net_total: number; vat_total: number; gross_total: number; issuer: InvoiceIssuer; note?: string | null; stay?: string | null; prices_net?: boolean; booking_number?: number | null; cancelled_at?: string | null; customer_number?: string | null; payment_method?: string | null; payment_terms?: string | null; due_date?: string | null }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Prices are gross (VAT included) by default; with pricesNet VAT is added on top. Mirrors create_invoice. */
export function invoiceTotals(items: InvoiceItem[], pricesNet = false) {
  let gross = 0, vat = 0;
  const byRate = new Map<number, { net: number; vat: number }>();
  for (const it of items) {
    const line = r2(it.quantity * it.unit_price);
    const v = pricesNet ? r2(line * it.vat_rate / 100) : r2(line - line / (1 + it.vat_rate / 100));
    const net = pricesNet ? line : line - v;
    gross += pricesNet ? line + v : line; vat += v;
    const cur = byRate.get(it.vat_rate) ?? { net: 0, vat: 0 };
    byRate.set(it.vat_rate, { net: r2(cur.net + net), vat: r2(cur.vat + v) });
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

const PAY_DE: Record<string, string> = { cash: "Bar", card: "EC-Karte", transfer: "Überweisung", invoice: "Rechnung / Überweisung", online: "Online-Zahlung" };
export const paymentMethodDe = (m?: string | null) => (m ? PAY_DE[m] ?? m : "");

/** Adds the due date to the issue date (Zahlungsziel in days). */
export function dueDateOf(issue: string, days: number) {
  const d = new Date(`${issue}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.max(0, Math.floor(days)));
  return d.toISOString().slice(0, 10);
}

/** WISO-Rechnung-style layout: info block (Rechnungs-/Kunden-/Buchungs-Nr.), Pos./Artikelnr./Einheit table, payment block. */
export function invoiceHtml(doc: InvoiceDoc) {
  const i = doc.issuer; const t = invoiceTotals(doc.items, !!doc.prices_net);
  const hasArt = doc.items.some((it) => it.article_no);
  const rows = doc.items.map((it, n) => `<tr><td>${esc(it.pos ?? n + 1)}</td>${hasArt ? `<td>${esc(it.article_no)}</td>` : ""}<td>${esc(it.description)}</td><td class="n">${esc(String(it.quantity).replace(".", ","))}</td><td>${esc(it.unit)}</td><td class="n">${eur(it.unit_price)}</td><td class="n">${esc(it.vat_rate)} %</td><td class="n">${eur(r2(it.quantity * it.unit_price))}</td></tr>`).join("");
  const span = hasArt ? 7 : 6;
  const vatRows = t.byRate.map((x) => `<tr><td colspan="${span}" class="n">Nettobetrag (${x.rate} %)</td><td class="n">${eur(x.net)}</td></tr><tr><td colspan="${span}" class="n">${doc.prices_net ? "zzgl." : "enth."} ${x.rate} % MwSt.</td><td class="n">${eur(x.vat)}</td></tr>`).join("");
  const info: [string, string | null | undefined][] = [
    ["Rechnungs-Nr.", doc.invoice_number], ["Kunden-Nr.", doc.customer_number], ["Rechnungsdatum", de(doc.issue_date)],
    ["Leistungszeitraum", doc.stay], ["Buchungs-Nr.", doc.booking_number ? `B-${doc.booking_number}` : null],
  ];
  const pay = [doc.payment_method && `<div>Zahlungsart: <strong>${esc(paymentMethodDe(doc.payment_method))}</strong></div>`,
    doc.due_date && doc.due_date !== doc.issue_date && `<div>Fällig am: <strong>${de(doc.due_date)}</strong></div>`,
    doc.payment_terms && `<div>${esc(doc.payment_terms)}</div>`].filter(Boolean).join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${esc(doc.invoice_number)}</title><style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:40px;font-size:12.5px}h1{font-size:22px;margin:28px 0 8px}.top{display:flex;justify-content:space-between;gap:24px}
.muted{color:#555}table{width:100%;border-collapse:collapse}.items{margin-top:16px}.items th{background:#f2f2f2;border-bottom:1px solid #999}th,td{padding:5px 4px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top;white-space:pre-line}.n{text-align:right;white-space:nowrap}
.info td{border:none;padding:1px 0 1px 12px}.info td:first-child{color:#555;padding-left:0}.sum td{font-weight:bold;border-top:2px solid #111;font-size:14px}.pay{margin-top:18px;line-height:1.6}
footer{margin-top:40px;font-size:10.5px;color:#555;border-top:1px solid #ddd;padding-top:8px;white-space:pre-line}@media print{body{margin:15mm}}
</style></head><body>
<div class="top"><div><div class="muted" style="font-size:10px;text-decoration:underline">${esc(i.company_name)} · ${esc((i.address ?? "").replace(/\n/g, ", "))}</div><p style="white-space:pre-line;margin-top:12px"><strong>${esc(doc.recipient_name)}</strong>\n${esc(doc.recipient_address)}</p></div>
<div style="text-align:right;white-space:pre-line"><strong>${esc(i.company_name)}</strong>\n${esc(i.address)}\n${esc(i.phone)}\n${esc(i.email)}</div></div>
<div class="top" style="align-items:flex-end"><h1>${doc.cancelled_at ? "STORNIERT – " : ""}Rechnung</h1>
<table class="info" style="width:auto">${info.filter(([, v]) => v).map(([k, v]) => `<tr><td>${k}</td><td class="n"><strong>${esc(v)}</strong></td></tr>`).join("")}</table></div>
<table class="items"><thead><tr><th>Pos.</th>${hasArt ? "<th>Artikelnr.</th>" : ""}<th>Beschreibung</th><th class="n">Menge</th><th>Einheit</th><th class="n">Einzelpreis${doc.prices_net ? " (netto)" : ""}</th><th class="n">MwSt.</th><th class="n">Gesamt</th></tr></thead><tbody>${rows}${vatRows}
<tr class="sum"><td colspan="${span}" class="n">Rechnungsbetrag</td><td class="n">${eur(t.gross)}</td></tr></tbody></table>
${pay ? `<div class="pay">${pay}</div>` : ""}
${doc.note ? `<p style="white-space:pre-line;margin-top:16px">${esc(doc.note)}</p>` : ""}
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
