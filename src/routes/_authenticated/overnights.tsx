import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, UserX } from "lucide-react";
import { AppShell, Section } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { LoadError } from "@/components/load-error";
import { formatDateDE } from "@/lib/date-de";
import { monthRange, totalsByProperty, stayTotals, type StayForStats, type NightTotals } from "@/lib/overnight-stats";

export const Route = createFileRoute("/_authenticated/overnights")({
  head: () => ({ meta: [
    { title: "Übernachtungen — Pension Highway" },
    { name: "description", content: "Zimmer- und Personennächte pro Standort und Monat für die Beherbergungsstatistik." },
    { property: "og:title", content: "Übernachtungen — Pension Highway" },
    { property: "og:description", content: "Zimmer- und Personennächte pro Standort und Monat." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: OvernightsPage,
});

const COPY = {
  de: { title: "Übernachtungen", subtitle: "Zimmer- und Personennächte für Statistik und Meldungen", room: "Zimmernächte", person: "Personennächte", unknown: "Ohne Personenzahl", location: "Standort", total: "Gesamt", export: "CSV", missing: "Personenzahl fehlt", missingHint: "Diese Buchungen zählen nur als Zimmernächte. Personenzahl eintragen, damit die Statistik vollständig ist.", none: "Alle Buchungen haben eine Personenzahl.", guest: "Gast", stay: "Aufenthalt", fix: "Eintragen", year: "Jahr", loading: "Wird geladen…" },
  tr: { title: "Gecelemeler", subtitle: "İstatistik ve bildirimler için oda ve kişi geceleri", room: "Oda-gece", person: "Kişi-gece", unknown: "Kişi sayısı yok", location: "Lokasyon", total: "Toplam", export: "CSV", missing: "Kişi sayısı eksik", missingHint: "Bu rezervasyonlar yalnızca oda-gece olarak sayılır. İstatistiğin tam olması için kişi sayısını girin.", none: "Tüm rezervasyonlarda kişi sayısı var.", guest: "Misafir", stay: "Konaklama", fix: "Gir", year: "Yıl", loading: "Yükleniyor…" },
  en: { title: "Overnight stays", subtitle: "Room and person nights for statistics and reporting", room: "Room nights", person: "Person nights", unknown: "Without guest count", location: "Location", total: "Total", export: "CSV", missing: "Guest count missing", missingHint: "These bookings only count as room nights. Enter the guest count to complete the statistics.", none: "All bookings have a guest count.", guest: "Guest", stay: "Stay", fix: "Enter", year: "Year", loading: "Loading…" },
};

type Metric = keyof NightTotals;
interface Row extends StayForStats { id: string; guest_name: string; room_id: string; rooms: { number: string } | null }

async function loadYear(year: number) {
  const from = `${year}-01-01`, to = `${year + 1}-01-01`;
  const rows: Row[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from("reservations")
      .select("id,property_id,room_id,guest_name,check_in,check_out,guests_count,guests_confirmed,rooms(number)")
      .lt("check_in", to).gt("check_out", from).is("deleted_at", null).not("status", "in", "(cancelled,no_show)")
      .order("id").range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  const { data: props, error } = await supabase.from("properties").select("id,name").order("name");
  if (error) throw error;
  return { rows, properties: props ?? [] };
}

function OvernightsPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith("tr") ? "tr" : i18n.language.startsWith("en") ? "en" : "de";
  const c = COPY[lang];
  const locale = lang === "tr" ? "tr-TR" : lang === "en" ? "en-GB" : "de-DE";
  const [year, setYear] = useState(new Date().getFullYear());
  const [metric, setMetric] = useState<Metric>("roomNights");
  const [editId, setEditId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["overnights", year], queryFn: () => loadYear(year) });

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    ...monthRange(year, i + 1),
    label: new Date(year, i, 1).toLocaleDateString(locale, { month: "short" }),
  })), [year, locale]);

  const table = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const perMonth = months.map((m) => totalsByProperty(rows, m.from, m.to));
    return (q.data?.properties ?? []).map((p) => {
      const vals = perMonth.map((m) => m.get(p.id)?.[metric] ?? 0);
      return { id: p.id, name: p.name, vals, sum: vals.reduce((a, b) => a + b, 0) };
    });
  }, [q.data, months, metric]);
  const colTotals = months.map((_, i) => table.reduce((s, r) => s + r.vals[i], 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);

  const yearRange = { from: `${year}-01-01`, to: `${year + 1}-01-01` };
  const missing = (q.data?.rows ?? []).filter((r) => !r.guests_confirmed).sort((a, b) => a.check_in.localeCompare(b.check_in));
  const propName = new Map((q.data?.properties ?? []).map((p) => [p.id, p.name]));

  const exportCsv = () => {
    const head = [c.location, ...months.map((m) => m.label), c.total];
    const lines = [head, ...table.map((r) => [r.name, ...r.vals, r.sum]), [c.total, ...colTotals, grand]];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `uebernachtungen-${year}-${metric}.csv`;
    a.click();
  };

  return (
    <AppShell title={c.title} subtitle={c.subtitle} actions={
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)} aria-label={c.year}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="font-semibold tabular-nums w-14 text-center">{year}</span>
        <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)} aria-label={c.year}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="outline" onClick={exportCsv} disabled={!q.data}><Download className="w-4 h-4" />{c.export}</Button>
      </div>
    }>
      {q.error ? <LoadError onRetry={() => q.refetch()} /> : (
        <>
          <div className="inline-flex rounded-md border border-input bg-card overflow-hidden mb-4">
            {(["roomNights", "personNights", "unknownNights"] as Metric[]).map((m) => (
              <button key={m} onClick={() => setMetric(m)} className={`px-3 py-2 text-sm ${metric === m ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-accent"}`}>
                {m === "roomNights" ? c.room : m === "personNights" ? c.person : c.unknown}
              </button>
            ))}
          </div>
          <Section title={metric === "roomNights" ? c.room : metric === "personNights" ? c.person : c.unknown}>
            {q.isLoading ? <p className="text-sm text-muted-foreground">{c.loading}</p> : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm min-w-[900px]">
                  <thead><tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left px-5 py-2 font-medium sticky left-0 bg-card">{c.location}</th>
                    {months.map((m) => <th key={m.from} className="text-right px-2 py-2 font-medium">{m.label}</th>)}
                    <th className="text-right px-5 py-2 font-semibold">{c.total}</th>
                  </tr></thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                        <td className="px-5 py-2 sticky left-0 bg-card">{r.name}</td>
                        {r.vals.map((v, i) => <td key={i} className={`text-right px-2 py-2 tabular-nums ${v ? "" : "text-muted-foreground/50"}`}>{v}</td>)}
                        <td className="text-right px-5 py-2 tabular-nums font-semibold">{r.sum}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-accent/40">
                      <td className="px-5 py-2 sticky left-0 bg-accent">{c.total}</td>
                      {colTotals.map((v, i) => <td key={i} className="text-right px-2 py-2 tabular-nums">{v}</td>)}
                      <td className="text-right px-5 py-2 tabular-nums">{grand}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="mt-6">
            <Section title={`${c.missing} (${missing.length})`}>
              <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5"><UserX className="w-3.5 h-3.5 text-warning" />{c.missingHint}</p>
              {missing.length === 0 ? <p className="text-sm text-muted-foreground">{c.none}</p> : (
                <ul className="divide-y divide-border max-h-96 overflow-y-auto">
                  {missing.slice(0, 200).map((r) => (
                    <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="font-medium min-w-0 flex-1 truncate">{r.guest_name}</span>
                      <span className="text-muted-foreground">{propName.get(r.property_id)} · #{r.rooms?.number}</span>
                      <span className="tabular-nums text-muted-foreground">{formatDateDE(r.check_in)} → {formatDateDE(r.check_out)} · {stayTotals(r, yearRange.from, yearRange.to).roomNights}</span>
                      <Button size="sm" variant="outline" onClick={() => setEditId(r.id)}>{c.fix}</Button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
      <EditReservationDialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)} reservationId={editId} onSaved={() => q.refetch()} />
    </AppShell>
  );
}
