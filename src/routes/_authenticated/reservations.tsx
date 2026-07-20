import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { useState, useMemo } from "react";
import { Search, Plus, Table as TableIcon, Building2, Pencil, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceColor, sourceLabel } from "@/lib/guest-color";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/reservations")({
  head: () => ({ meta: [{ title: "Reservations — Pensify" }] }),
  component: ReservationsPage,
});

interface Row {
  id: string;
  guest_name: string;
  channel: string;
  status: string;
  check_in: string;
  check_out: string;
  guests_count: number;
  revenue: number;
  room: { number: string; property_id: string } | null;
  property: { id: string; name: string } | null;
}

function ReservationsPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const isAdmin = perms.isAdmin;
  const [view, setView] = useState<"table" | "property">("table");
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const { data, refetch } = useQuery({
    queryKey: ["reservations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id,guest_name,channel,status,check_in,check_out,guests_count,revenue,room:rooms(number,property_id),property:properties(id,name)")
        .order("check_in", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = data ?? [];
  const channels = useMemo(() => Array.from(new Set(rows.map((r) => r.channel))), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (src !== "all" && r.channel !== src) return false;
        if (q && !(r.guest_name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [rows, q, src],
  );

  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.property) map.set(r.property.id, r.property.name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  const isLocked = (r: Row) => r.check_out <= today && !isAdmin;

  return (
    <AppShell
      title={t("pages.reservations.title")}
      subtitle={t("pages.reservations.subtitle", { count: rows.length })}
      actions={
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Neu
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gast suchen…"
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          className="px-3 py-2 rounded-md border border-input bg-card text-sm"
        >
          <option value="all">Alle Kanäle</option>
          {channels.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s)}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-input bg-card overflow-hidden">
          <button
            onClick={() => setView("table")}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${view === "table" ? "bg-accent" : ""}`}
          >
            <TableIcon className="w-4 h-4" /> Tabelle
          </button>
          <button
            onClick={() => setView("property")}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${view === "property" ? "bg-accent" : ""}`}
          >
            <Building2 className="w-4 h-4" /> Nach Pension
          </button>
        </div>
      </div>

      {view === "table" ? (
        <Section title={`${filtered.length} Buchungen`}>
          <div className="overflow-x-auto -m-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-5 py-3 font-medium">Gast</th>
                  <th className="px-5 py-3 font-medium">Kanal</th>
                  <th className="px-5 py-3 font-medium">Pension</th>
                  <th className="px-5 py-3 font-medium">Zimmer</th>
                  <th className="px-5 py-3 font-medium">Check-in</th>
                  <th className="px-5 py-3 font-medium">Check-out</th>
                  <th className="px-5 py-3 font-medium text-right">Gäste</th>
                  <th className="px-5 py-3 font-medium text-right">Umsatz</th>
                  <th className="px-5 py-3 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const locked = isLocked(r);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border/60 hover:bg-accent/40 ${r.check_out <= today ? "opacity-70" : ""}`}
                    >
                      <td className="px-5 py-3 font-medium">{r.guest_name}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: sourceColor(r.channel) }} />
                          {sourceLabel(r.channel)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{r.property?.name ?? "—"}</td>
                      <td className="px-5 py-3">#{r.room?.number ?? "—"}</td>
                      <td className="px-5 py-3">{r.check_in}</td>
                      <td className="px-5 py-3">{r.check_out}</td>
                      <td className="px-5 py-3 text-right">{r.guests_count}</td>
                      <td className="px-5 py-3 text-right font-medium">€{Number(r.revenue ?? 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setEditId(r.id)}
                          disabled={locked}
                          title={locked ? "Abgelaufene Buchung — nur Admin/Inhaber" : "Bearbeiten"}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-input bg-card text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {locked ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                          {locked ? "Gesperrt" : "Bearbeiten"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      Keine Buchungen gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {properties.map((p) => {
            const list = filtered.filter((r) => r.property?.id === p.id);
            return (
              <Section key={p.id} title={`${p.name} · ${list.length}`}>
                {list.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Keine Buchungen</div>
                ) : (
                  <div className="space-y-2">
                    {list.slice(0, 8).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => !isLocked(r) && setEditId(r.id)}
                        className="w-full flex items-center justify-between text-left text-sm hover:bg-accent/40 rounded-md px-2 py-1.5 disabled:opacity-50"
                        disabled={isLocked(r)}
                      >
                        <div>
                          <div className="font-medium">{r.guest_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Zimmer #{r.room?.number} · {r.check_in} → {r.check_out}
                          </div>
                        </div>
                        <Badge tone="muted">{sourceLabel(r.channel)}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            );
          })}
        </div>
      )}

      <NewReservationDialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) refetch(); }} />
      <EditReservationDialog
        open={!!editId}
        onOpenChange={(o) => { if (!o) setEditId(null); }}
        reservationId={editId}
        onSaved={() => refetch()}
      />
    </AppShell>
  );
}
