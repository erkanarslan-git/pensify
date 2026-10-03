import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useState, useMemo } from "react";
import { Search, Plus, Pencil, Lock, LogIn, LogOut, BedDouble, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceColor, sourceLabel } from "@/lib/guest-color";
import { usePermissions } from "@/hooks/use-permissions";

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
  room: { number: string; property_id: string } | null;
  property: { id: string; name: string } | null;
}

type Period = "upcoming" | "today" | "past" | "all";

const statusLabel: Record<string, { label: string; tone: "success" | "info" | "warning" | "destructive" | "muted" }> = {
  confirmed: { label: "Bestätigt", tone: "success" },
  tentative: { label: "Vorläufig", tone: "warning" },
  checked_in: { label: "Eingecheckt", tone: "info" },
  checked_out: { label: "Ausgecheckt", tone: "muted" },
  cancelled: { label: "Storniert", tone: "destructive" },
  no_show: { label: "No-Show", tone: "destructive" },
};

function fmt(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y.slice(2)}`;
}

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
        .select("id,guest_name,channel,status,check_in,check_out,guests_count,revenue,room:rooms(number,property_id),property:properties(id,name)")
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

  const channels = useMemo(() => Array.from(new Set(rows.map((r) => r.channel))), [rows]);
  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.property) map.set(r.property.id, r.property.name);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (src !== "all" && r.channel !== src) return false;
        if (prop !== "all" && r.property?.id !== prop) return false;
        if (q && !(r.guest_name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
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

  const periods: { id: Period; label: string }[] = [
    { id: "upcoming", label: "Aktuell & kommend" },
    { id: "today", label: "Heute im Haus" },
    { id: "past", label: "Vergangen" },
    { id: "all", label: "Alle" },
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
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard icon={<LogIn className="w-4 h-4" />} label="Anreisen heute" value={arrivals} />
        <StatCard icon={<LogOut className="w-4 h-4" />} label="Abreisen heute" value={departures} />
        <StatCard icon={<BedDouble className="w-4 h-4" />} label="Gäste im Haus" value={staying} />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {periods.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${period === p.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
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

      {error ? (
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
              <details key={g.id} open className="group rounded-xl border border-border bg-card">
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
                    <span className="font-semibold truncate">{g.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {g.items.length} Buchungen · {gArr} Anreise · {gDep} Abreise
                  </span>
                </summary>
                <div className="border-t border-border divide-y divide-border/60">
                  {g.items.map((r) => {
                    const locked = isLocked(r);
                    const st = statusLabel[r.status] ?? { label: r.status, tone: "muted" as const };
                    return (
                      <div
                        key={r.id}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm ${r.check_out < today ? "opacity-70" : ""}`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sourceColor(r.channel) }} title={sourceLabel(r.channel)} />
                        <div className="min-w-[160px] flex-1">
                          <div className="font-medium">{r.guest_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {sourceLabel(r.channel)} · {r.guests_count} Gäste
                          </div>
                        </div>
                        <span className="w-16 text-muted-foreground">#{r.room?.number ?? "—"}</span>
                        <span className="w-36 tabular-nums">{fmt(r.check_in)} → {fmt(r.check_out)}</span>
                        <span className="w-24"><Badge tone={st.tone}>{st.label}</Badge></span>
                        <span className="w-20 text-right font-medium tabular-nums">€{Number(r.revenue ?? 0).toLocaleString("de-DE")}</span>
                        <button
                          onClick={() => setEditId(r.id)}
                          disabled={locked}
                          title={locked ? "Abgelaufene Buchung — nur Admin/Inhaber" : "Bearbeiten"}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-input bg-card text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {locked ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                          {locked ? "Gesperrt" : "Bearbeiten"}
                        </button>
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
