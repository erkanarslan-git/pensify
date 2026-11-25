import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Printer, Search } from "lucide-react";
import { AppShell, Badge } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateDE } from "@/lib/date-de";
import { printInvoice, type InvoiceDoc } from "@/lib/invoice";
import { bookingNumberQuery } from "@/lib/reservation-list";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [
    { title: "Rechnungen — Pension Highway" },
    { name: "description", content: "Alle ausgestellten Rechnungen mit Buchungsnummer, Betrag und Status." },
    { property: "og:title", content: "Rechnungen — Pension Highway" },
    { property: "og:description", content: "Alle ausgestellten Rechnungen mit Buchungsnummer, Betrag und Status." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: InvoicesPage,
});

const L: Record<string, Record<string, string>> = {
  de: { sub: "Rechnungen werden in der jeweiligen Buchung erstellt. Ausgestellte Rechnungen sind unveränderbar; nur Admins können stornieren.", search: "Rechnungs-Nr., Empfänger oder Buchungs-Nr.", number: "Rechnungs-Nr.", booking: "Buchung", date: "Datum", recipient: "Empfänger", gross: "Brutto", net: "Netto", state: "Status", ok: "Gültig", cancelled: "Storniert", sent: "Versendet", empty: "Noch keine Rechnungen.", all: "Alle", total: "Summe (gültig)" },
  tr: { sub: "Faturalar ilgili rezervasyonun içinden kesilir. Kesilen fatura değiştirilemez; yalnızca yöneticiler iptal edebilir.", search: "Fatura no., alıcı veya rezervasyon no.", number: "Fatura no.", booking: "Rezervasyon", date: "Tarih", recipient: "Alıcı", gross: "Brüt", net: "Net", state: "Durum", ok: "Geçerli", cancelled: "İptal", sent: "Gönderildi", empty: "Henüz fatura yok.", all: "Tümü", total: "Toplam (geçerli)" },
  en: { sub: "Invoices are created inside each booking. Issued invoices cannot be changed; only admins can cancel.", search: "Invoice no., recipient or booking no.", number: "Invoice no.", booking: "Booking", date: "Date", recipient: "Recipient", gross: "Gross", net: "Net", state: "Status", ok: "Valid", cancelled: "Cancelled", sent: "Sent", empty: "No invoices yet.", all: "All", total: "Total (valid)" },
};
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

type Row = InvoiceDoc & { id: string; sent_at: string | null; cancelled_at: string | null; booking_number: number | null };

function InvoicesPage() {
  const { i18n } = useTranslation();
  const T = L[i18n.language.slice(0, 2)] ?? L.de!;
  const [q, setQ] = useState("");
  const [state, setState] = useState<"all" | "ok" | "cancelled">("all");
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase(); const num = bookingNumberQuery(q);
    return (data ?? []).filter((r) => (state === "all" || (state === "cancelled") === !!r.cancelled_at)
      && (!term || r.invoice_number.toLowerCase().includes(term) || r.recipient_name.toLowerCase().includes(term) || (num != null && r.booking_number === num)));
  }, [data, q, state]);
  const sum = rows.filter((r) => !r.cancelled_at).reduce((a, r) => a + Number(r.gross_total), 0);
  return (
    <AppShell title={i18n.language.startsWith("tr") ? "Faturalar" : i18n.language.startsWith("en") ? "Invoices" : "Rechnungen"} subtitle={T.sub}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search} maxLength={120} className="w-full rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={state} onChange={(e) => setState(e.target.value as typeof state)} className="rounded-md border border-input bg-card px-3 py-2 text-sm">
          <option value="all">{T.all}</option><option value="ok">{T.ok}</option><option value="cancelled">{T.cancelled}</option>
        </select>
        <span className="text-sm text-muted-foreground">{T.total}: <strong className="text-foreground">{eur(sum)}</strong></span>
      </div>
      {error ? <p className="text-sm text-destructive">{String((error as Error).message)}</p> : isLoading ? null : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{T.empty}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2">{T.number}</th><th className="px-4 py-2">{T.booking}</th><th className="px-4 py-2">{T.date}</th><th className="px-4 py-2">{T.recipient}</th><th className="px-4 py-2 text-right">{T.net}</th><th className="px-4 py-2 text-right">{T.gross}</th><th className="px-4 py-2">{T.state}</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.id} className={r.cancelled_at ? "opacity-60" : ""}>
                  <td className="px-4 py-2 font-medium">{r.invoice_number}</td>
                  <td className="px-4 py-2 font-mono">{r.booking_number ? <Link to="/reservations" search={{ q: `B-${r.booking_number}` }} className="underline-offset-2 hover:underline">B-{r.booking_number}</Link> : "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{formatDateDE(r.issue_date)}</td>
                  <td className="px-4 py-2">{r.recipient_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur(Number(r.net_total))}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{eur(Number(r.gross_total))}</td>
                  <td className="px-4 py-2"><span className="flex gap-1">{r.cancelled_at ? <Badge tone="destructive">{T.cancelled}</Badge> : <Badge tone="success">{T.ok}</Badge>}{r.sent_at && <Badge tone="info">{T.sent}</Badge>}</span></td>
                  <td className="px-4 py-2 text-right"><Button size="sm" variant="outline" onClick={() => printInvoice(r)}><Printer className="mr-1 h-4 w-4" />PDF</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
