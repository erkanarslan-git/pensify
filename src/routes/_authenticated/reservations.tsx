import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useState, useMemo } from "react";
import { Search, Plus, Pencil, Lock, LogIn, LogOut, BedDouble, ChevronDown, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceColor, sourceLabel, normalizeChannel, ACTIVE_CHANNELS } from "@/lib/guest-color";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import { ReservationTrash } from "@/components/reservation-trash";
import { formatDateDE } from "@/lib/date-de";

type Search = { property?: string };

export const Route = createFileRoute("/_authenticated/reservations")({
  validateSearch: (s: Record<string, unknown>): Search =>
    typeof s.property === "string" && s.property ? { property: s.property } : {},
  head: () => ({ meta: [{ title: "Buchungen — Pensify" }] }),
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
  customer_type?: string | null;
  company_name?: string | null;
  room: { number: string; property_id: string } | null;
  property: { id: string; name: string } | null;
}

type Period = "upcoming" | "today" | "past" | "all" | "trash";

const statusLabel: Record<string, { label: string; tone: "success" | "info" | "warning" | "destructive" | "muted" }> = {
  confirmed: { label: "Bestätigt", tone: "success" },
  tentative: { label: "Vorläufig", tone: "warning" },
  checked_in: { label: "Eingecheckt", tone: "info" },
  checked_out: { label: "Ausgecheckt", tone: "muted" },
  cancelled: { label: "Storniert", tone: "destructive" },
  no_show: { label: "No-Show", tone: "destructive" },
};

const fmt = formatDateDE;

function ReservationsPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const isAdmin = perms.isAdmin;
  const search = Route.useSearch();
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<string>("all");
  const [prop, setProp] = useState<string>(search.property ?? "all");
  const [period, setPeriod] = useState<Period>("upcoming");
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const { data, refetch, error, isLoading } = useQuery({
    queryKey: ["reservations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id,guest_name,channel,status,check_in,check_out,guests_count,revenue,customer_type,company_name,room:rooms(number,property_id),property:properties(id,name)")
        .is("deleted_at", null)
        .order("check_in", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = data ?? [];
  const active = (r: Row) => r.status !== "cancelled" && r.status !== "no_show";
  const arrivals = rows.filter((r) => active(r) && r.check_in === today).length;
  const departures = rows.filter((r) => active(r) && r.check_out === today).length;
  const staying = rows.filter((r) => active(r) && r.check_in <= today && r.check_out > today).length;

  const channels = ACTIVE_CHANNELS;
  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.property) map.set(r.property.id, r.property.name);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (src !== "all" && normalizeChannel(r.channel) !== src) return false;
        if (prop !== "all" && r.property?.id !== prop) return false;
        if (q && !`${r.guest_name ?? ""} ${r.company_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (period === "upcoming" && r.check_out < today) return false;
        if (period === "today" && !(r.check_in <= today && r.check_out >= today)) return false;
        if (period === "past" && r.check_out >= today) return false;
        return true;
      }),
    [rows, q, src, prop, period, today],
  );

  const groups = useMemo(() => {
    const list = properties
      .map((p) => ({ ...p, items: filtered.filter((r) => r.property?.id === p.id) }))
      .filter((g) => g.items.length > 0);
    if (period === "past") list.forEach((g) => g.items.reverse());
    return list;
  }, [properties, filtered, period]);

  const isLocked = (r: Row) => r.check_out <= today && !isAdmin;

  const softDelete = async (r: Row) => {
    const reason = window.prompt(`Buchung von ${r.guest_name} löschen?\nSie landet im Papierkorb (nur Admins können sie wiederherstellen).\n\nGrund (optional):`, "");
    if (reason === null) return;
    const { error } = await (supabase as any).rpc("soft_delete_reservation", { _id: r.id, _reason: reason });
    if (error) { toast.error(error.code === "42501" ? "Keine Berechtigung zum Löschen." : "Löschen fehlgeschlagen."); return; }
    toast.success("Buchung in den Papierkorb verschoben");
    refetch();
  };

  const periods: { id: Period; label: string }[] = [
    { id: "upcoming", label: "Aktuell & kommend" },
    { id: "today", label: "Heute im Haus" },
    { id: "past", label: "Vergangen" },
    { id: "all", label: "Alle" },
    ...(isAdmin ? [{ id: "trash" as Period, label: "Papierkorb" }] : []),
  ];

  return (
    <AppShell
      title={t("pages.reservations.title")}
      subtitle={`${filtered.length} Buchungen`}
      actions={
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Neue Buchung
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <StatCard highlight icon={<LogIn className="w-4 h-4" />} label="Anreisen heute" value={arrivals} />
        <StatCard icon={<LogOut className="w-4 h-4" />} label="Abreisen heute" value={departures} />
        <StatCard icon={<BedDouble className="w-4 h-4" />} label="Gäste im Haus" value={staying} />
      </div>

      <div className="inline-flex flex-wrap gap-1 p-1 mb-3 rounded-xl bg-muted">
        {periods.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

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
        <select value={prop} onChange={(e) => setProp(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm">
          <option value="all">Alle Pensionen</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={src} onChange={(e) => setSrc(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm">
          <option value="all">Alle Kanäle</option>
          {channels.map((s) => (
            <option key={s} value={s}>{sourceLabel(s)}</option>
          ))}
        </select>
      </div>

      {period === "trash" && isAdmin ? (
        <ReservationTrash onChanged={() => refetch()} />
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          Buchungen konnten nicht geladen werden.{" "}
          <button onClick={() => refetch()} className="underline font-medium">Erneut versuchen</button>
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Keine Buchungen für diese Auswahl.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const gArr = g.items.filter((r) => active(r) && r.check_in === today).length;
            const gDep = g.items.filter((r) => active(r) && r.check_out === today).length;
            return (
              <details key={g.id} open className="group rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
                    <span className="font-semibold truncate">{g.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{g.items.length}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {gArr} Anreise · {gDep} Abreise
                  </span>
                </summary>
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_64px_190px_110px_80px_auto] gap-4 px-4 py-2 border-t border-border bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>Gast</span><span>Zimmer</span><span>Zeitraum</span><span>Status</span><span className="text-right">Betrag</span><span className="w-[120px]" />
                </div>
                <div className="border-t border-border divide-y divide-border/60">
                  {g.items.map((r) => {
                    const locked = isLocked(r);
                    const st = statusLabel[r.status] ?? { label: r.status, tone: "muted" as const };
                    const color = sourceColor(r.channel);
                    return (
                      <div
                        key={r.id}
                        className={`grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_64px_190px_110px_80px_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-accent/40 transition-colors ${r.check_out < today ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: color }} />
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {r.customer_type === "company" ? (r.company_name ?? r.guest_name) : r.guest_name}
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border text-muted-foreground">{r.customer_type === "company" ? "Firma" : "Privat"}</span>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                              {sourceLabel(r.channel)} · {r.guests_count} Gäste
                              {r.customer_type === "company" && r.company_name && r.guest_name !== r.company_name && <> · Gast: {r.guest_name}</>}
                            </div>
                          </div>
                        </div>
                        <span className="md:hidden text-right font-semibold tabular-nums">€{Number(r.revenue ?? 0).toLocaleString("de-DE")}</span>
                        <span className="hidden md:block text-muted-foreground tabular-nums">{r.room?.number ?? "—"}</span>
                        <span className="text-xs md:text-sm tabular-nums text-muted-foreground md:text-foreground">{fmt(r.check_in)} → {fmt(r.check_out)}</span>
                        <span className="md:block text-right md:text-left"><Badge tone={st.tone}>{st.label}</Badge></span>
                        <span className="hidden md:block text-right font-semibold tabular-nums">€{Number(r.revenue ?? 0).toLocaleString("de-DE")}</span>
                        <div className="col-span-2 md:col-span-1 flex justify-end gap-1.5 w-full md:w-[120px]">
                          <button
                            onClick={() => setEditId(r.id)}
                            disabled={locked}
                            title={locked ? "Abgelaufene Buchung — nur Admin/Inhaber" : "Bearbeiten"}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-input bg-card text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {locked ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                            {locked ? "Gesperrt" : "Bearbeiten"}
                          </button>
                          {!locked && (
                            <button
                              onClick={() => softDelete(r)}
                              title="Löschen (in den Papierkorb)"
                              aria-label="Löschen"
                              className="inline-flex items-center px-2 py-1.5 rounded-lg border border-input bg-card text-xs text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
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

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl px-5 py-4 shadow-sm ${highlight ? "brand-tile" : "border border-border bg-card"}`}>
      <div className={`flex items-center gap-1.5 text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{icon} {label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
