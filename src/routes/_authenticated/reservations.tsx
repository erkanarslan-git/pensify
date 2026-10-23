import { displayLocale } from "@/i18n/legacy-ui";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useState, useMemo, useEffect } from "react";
import { Search, Plus, Pencil, Lock, LogIn, LogOut, BedDouble, ChevronDown, Trash2, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NewReservationDialog } from "@/components/new-reservation-dialog";
import { EditReservationDialog } from "@/components/edit-reservation-dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceColor, sourceLabel, ACTIVE_CHANNELS } from "@/lib/guest-color";
import { businessDate } from "@/lib/business-time";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import { ReservationTrash } from "@/components/reservation-trash";
import { formatDateDE } from "@/lib/date-de";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { listReservations, exportReservations } from "@/lib/reservation-list.functions";
import { RESERVATION_PAGE_SIZES, reservationCsvCell, type ReservationFilters, type ReservationListRow } from "@/lib/reservation-list";

type Search = { property?: string; created?: string };

export const Route = createFileRoute("/_authenticated/reservations")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof s.property === "string" && s.property) out.property = s.property;
    if (typeof s.created === "string" && s.created) out.created = s.created;
    return out;
  },
  head: () => ({ meta: [{ title: "Rezervasyonlar — Pensify" }, { name: "description", content: "Pensify'da rezervasyonları ve girişleri yönetin." }, { property: "og:title", content: "Rezervasyonlar — Pensify" }, { property: "og:description", content: "Pensify'da rezervasyonları ve girişleri yönetin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReservationsPage,
});

type Row = ReservationListRow;

type Period = "upcoming" | "today" | "past" | "all" | "trash";

const statusTone: Record<string, "success" | "info" | "warning" | "destructive" | "muted"> = {
  confirmed: "success",
  tentative: "warning",
  checked_in: "info",
  checked_out: "muted",
  cancelled: "destructive",
  no_show: "destructive",
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
  const [period, setPeriod] = useState<Period>(search.created === "today" ? "all" : "upcoming");
  const [createdTodayOnly, setCreatedTodayOnly] = useState(search.created === "today");
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<10 | 20 | 30 | 40 | 50>(20);
  const [dq, setDq] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<ReservationFilters["sort"]>("arrivalAsc");
  const [exportBusy, setExportBusy] = useState(false);
  const fetchList = useServerFn(listReservations);
  const fetchExport = useServerFn(exportReservations);
  const today = businessDate();
  useEffect(() => {
    const timer = setTimeout(() => { setDq(q.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => setPage(0), [src, prop, period, status, createdTodayOnly, from, to, sort, pageSize]);
  const filters: ReservationFilters = {
    search: dq, propertyId: prop, source: src as ReservationFilters["source"],
    status: status as ReservationFilters["status"], period: period === "trash" ? "all" : period,
    createdTodayOnly, from, to, sort,
  };
  const { data, refetch, error, isLoading } = useQuery({
    queryKey: ["reservations-list", filters, page, pageSize, today],
    queryFn: ({ signal }) => fetchList({ data: { ...filters, page, pageSize }, signal }),
    enabled: period !== "trash",
  });
  const arrivals = data?.stats.arrivals;
  const departures = data?.stats.departures;
  const staying = data?.stats.staying;
  const channels = ACTIVE_CHANNELS;
  const properties = data?.properties ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const safePage = data?.page ?? page;
  useEffect(() => { if (data && page !== data.page) setPage(data.page); }, [data, page]);
  const pageItems = data?.rows ?? [];
  const groups = useMemo(() => {
    const list = properties
      .map((p) => ({ ...p, items: pageItems.filter((r) => r.property?.id === p.id) }))
      .filter((g) => g.items.length > 0);
    return list;
  }, [properties, pageItems]);

  const isLocked = (r: Row) => r.check_out <= today && !isAdmin;

  async function download() {
    setExportBusy(true);
    try {
      const rows = await fetchExport({ data: filters });
      const headings = [t("resv.thGuest"), t("resv.companyTag"), t("calendar.allPensions"), t("resv.thRoom"), t("resv.thPeriod"), t("resv.thStatus"), t("common.allSources"), t("resv.thAmount")];
      const lines = [headings, ...rows.map(r => [r.guest_name, r.company_name, r.property?.name, r.room?.number, `${r.check_in} → ${r.check_out}`, t(`resStatus.${r.status}`), sourceLabel(r.channel, k => t(k)), r.revenue])];
      const url = URL.createObjectURL(new Blob(["\ufeff" + lines.map(line => line.map(reservationCsvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `Pensify-${today}.csv`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error(t("resv.loadError")); } finally { setExportBusy(false); }
  }

  const softDelete = async (r: Row) => {
    const reason = window.prompt(t("resv.deletePrompt", { name: r.guest_name }), "");
    if (reason === null) return;
    const { error } = await (supabase as any).rpc("soft_delete_reservation", { _id: r.id, _reason: reason });
    if (error) { toast.error(error.code === "42501" ? t("resv.noPermission") : t("resv.deleteFailed")); return; }
    toast.success(t("resv.deletedToast"));
    refetch();
  };

  const periods: { id: Period; label: string }[] = [
    { id: "upcoming", label: t("resv.periodUpcoming") },
    { id: "today", label: t("resv.periodToday") },
    { id: "past", label: t("resv.periodPast") },
    { id: "all", label: t("common.all") },
    ...(isAdmin ? [{ id: "trash" as Period, label: t("resv.periodTrash") }] : []),
  ];

  return (
    <AppShell
      title={t("pages.reservations.title")}
      subtitle={t("resv.bookingsSubtitle", { count: data?.total ?? 0 })}
      actions={
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> {t("common.newReservation")}
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <StatCard highlight icon={<LogIn className="w-4 h-4" />} label={t("resv.arrivalsToday")} value={arrivals} />
        <StatCard icon={<LogOut className="w-4 h-4" />} label={t("resv.departuresToday")} value={departures} />
        <StatCard icon={<BedDouble className="w-4 h-4" />} label={t("resv.guestsInHouse")} value={staying} />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t("reservationList.filteredScope")}</p>

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
            maxLength={120}
            placeholder={t("resv.searchGuest")}
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-card text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select value={prop} onChange={(e) => setProp(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm">
          <option value="all">{t("calendar.allPensions")}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm">
          <option value="all">{t("common.all")}</option>
          {Object.keys(statusTone).map((s) => (
            <option key={s} value={s}>{t(`resStatus.${s}`, { defaultValue: s })}</option>
          ))}
        </select>
        <select value={src} onChange={(e) => setSrc(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm">
          <option value="all">{t("common.allSources")}</option>
          {channels.map((s) => (
            <option key={s} value={s}>{sourceLabel(s, (k) => t(k))}</option>
          ))}
        </select>
        <button
          onClick={() => setCreatedTodayOnly((v) => !v)}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${createdTodayOnly ? "bg-primary text-primary-foreground" : "border border-input bg-card text-muted-foreground hover:text-foreground"}`}
        >
          {t("resv.createdTodayToggle")}
        </button>
        <input type="date" aria-label={t("reservationList.from")} value={from} onChange={e => setFrom(e.target.value)} className="min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm" />
        <input type="date" aria-label={t("reservationList.to")} value={to} onChange={e => setTo(e.target.value)} className="min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm" />
        <select aria-label={t("reservationList.sort")} value={sort} onChange={e => setSort(e.target.value as ReservationFilters["sort"])} className="max-w-full rounded-md border border-input bg-card px-3 py-2 text-sm">
          {["arrivalAsc", "arrivalDesc", "createdDesc"].map(value => <option key={value} value={value}>{t(`reservationList.${value}`)}</option>)}
        </select>
        <select aria-label={t("reservationList.pageSize")} value={pageSize} onChange={e => setPageSize(Number(e.target.value) as typeof pageSize)} className="rounded-md border border-input bg-card px-3 py-2 text-sm">
          {RESERVATION_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
        <Button variant="outline" onClick={download} disabled={exportBusy || period === "trash"}><Download className="mr-2 h-4 w-4" />{t("reservationList.export")}</Button>
      </div>

      {period === "trash" && isAdmin ? (
        <ReservationTrash onChanged={() => refetch()} />
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          {t("resv.loadError")}{" "}
          <button onClick={() => refetch()} className="underline font-medium">{t("rooms.retry")}</button>
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("resv.noResults")}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            return (
              <details key={g.id} open className="group rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
                    <span className="font-semibold truncate">{g.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{g.items.length}</span>
                  </div>
                </summary>
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_64px_190px_110px_80px_auto] gap-4 px-4 py-2 border-t border-border bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span>{t("resv.thGuest")}</span><span>{t("resv.thRoom")}</span><span>{t("resv.thPeriod")}</span><span>{t("resv.thStatus")}</span><span className="text-right">{t("resv.thAmount")}</span><span className="w-[120px]" />
                </div>
                <div className="border-t border-border divide-y divide-border/60">
                  {g.items.map((r) => {
                    const locked = isLocked(r);
                    const st = { label: t(`resStatus.${r.status}`, { defaultValue: r.status }), tone: statusTone[r.status] ?? ("muted" as const) };
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
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border text-muted-foreground">{r.customer_type === "company" ? t("resv.companyTag") : t("resv.privateTag")}</span>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                              {sourceLabel(r.channel, (k) => t(k))} · {t("resv.guestsCount", { count: r.guests_count })}
                              {r.customer_type === "company" && r.company_name && r.guest_name !== r.company_name && <>{t("resv.guestSuffix")}{r.guest_name}</>}
                            </div>
                          </div>
                        </div>
                        <span className="md:hidden text-right font-semibold tabular-nums">€{Number(r.revenue ?? 0).toLocaleString(displayLocale())}</span>
                        <span className="hidden md:block text-muted-foreground tabular-nums">{r.room?.number ?? "—"}</span>
                        <span className="text-xs md:text-sm tabular-nums text-muted-foreground md:text-foreground">{fmt(r.check_in)} → {fmt(r.check_out)}</span>
                        <span className="md:block text-right md:text-left"><Badge tone={st.tone}>{st.label}</Badge></span>
                        <span className="hidden md:block text-right font-semibold tabular-nums">€{Number(r.revenue ?? 0).toLocaleString(displayLocale())}</span>
                        <div className="col-span-2 md:col-span-1 flex justify-end gap-1.5 w-full md:w-[120px]">
                          <button
                            onClick={() => setEditId(r.id)}
                            disabled={locked}
                            title={locked ? t("resv.lockedTitle") : t("common.edit")}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-input bg-card text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {locked ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                            {locked ? t("resv.locked") : t("common.edit")}
                          </button>
                          {!locked && (
                            <button
                              onClick={() => softDelete(r)}
                              title={t("resv.deleteTitle")}
                              aria-label={t("common.delete")}
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
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2 text-sm">
              <Button variant="outline" size="icon" title={t("reservationList.previous")} aria-label={t("reservationList.previous")} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="tabular-nums text-muted-foreground">{safePage + 1} / {pageCount}</span>
              <Button variant="outline" size="icon" title={t("reservationList.next")} aria-label={t("reservationList.next")} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
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

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number | undefined; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl px-5 py-4 shadow-sm ${highlight ? "brand-tile" : "border border-border bg-card"}`}>
      <div className={`flex items-center gap-1.5 text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{icon} {label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value ?? "—"}</div>
    </div>
  );
}
