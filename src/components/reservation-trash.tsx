import { useState } from "react";
import { confirmAction, promptAction } from "@/components/confirm-dialog";
import { useTranslation } from "react-i18next";
import { displayLocale } from "@/i18n/legacy-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sourceColor, sourceLabel } from "@/lib/guest-color";
import { formatDateDE } from "@/lib/date-de";

const PAGE = 20;
type Row = { id: string; guest_name: string; channel: string; check_in: string; check_out: string; deleted_at: string; purge_at: string; delete_reason: string | null; room: string | null; property: string; deleter: string | null; blocker: string | null };

/** Admin-only 7-day recycle bin for soft-deleted reservations; paging and filters run on the server. */
export function ReservationTrash({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reservations-trash", search, from, to, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_reservation_trash", { _search: search || undefined, _from: from || undefined, _to: to || undefined, _limit: PAGE, _offset: page * PAGE });
      if (error) throw error;
      return data as unknown as { total: number; rows: Row[] };
    },
  });
  const when = (v: string) => new Date(v).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE, dateStyle: "short", timeStyle: "short" });

  const act = async (fn: "restore_reservation" | "purge_reservation", id: string) => {
    if (busy) return;
    if (fn === "purge_reservation" && !(await confirmAction({ description: t("legacyUi.purgeConfirm"), destructive: true }))) return;
    setBusy(id);
    try {
      const { error } = await supabase.rpc(fn, { _id: id });
      if (error) {
        const m = error.message;
        toast.error(m.includes("overlap") ? t("legacyUi.restoreConflict") : m.includes("finance_history") || m.includes("linked_tasks") ? t("legacyUi.trashBlocked") : t("cleaning.actionFailed"));
        return;
      }
      toast.success(fn === "restore_reservation" ? t("legacyUi.restored") : t("legacyUi.purged"));
      await query.refetch();
      onChanged();
    } finally { setBusy(null); }
  };

  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const rows = query.data?.rows ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("legacyUi.trashInfo")}</p>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-[200px] flex-1" placeholder={t("legacyUi.trashSearch")} aria-label={t("legacyUi.trashSearch")} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <Input type="date" className="w-40" aria-label={t("legacyUi.trashFrom")} title={t("legacyUi.trashFrom")} value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} />
        <Input type="date" className="w-40" aria-label={t("legacyUi.trashTo")} title={t("legacyUi.trashTo")} value={to} onChange={e => { setTo(e.target.value); setPage(0); }} />
      </div>
      {query.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/40 p-6 text-center text-sm">
          {t("legacyUi.trashLoadFailed")} <Button variant="outline" size="sm" className="ml-2" onClick={() => query.refetch()}>{t("legacyUi.retry")}</Button>
        </div>
      ) : query.isLoading ? <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      : !rows.length ? <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("legacyUi.trashEmpty")}</div>
      : <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
        {rows.map(r => (
          <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="w-2 h-2 rounded-full" style={{ background: sourceColor(r.channel) }} />
            <div className="flex-1 min-w-[180px]">
              <div className="font-medium">{r.guest_name}</div>
              <div className="text-xs text-muted-foreground">{r.property} · #{r.room ?? "—"} · {sourceLabel(r.channel, key => t(key))} · {formatDateDE(r.check_in)} → {formatDateDE(r.check_out)}</div>
            </div>
            <div className="text-xs text-muted-foreground min-w-[200px]">
              {t("legacyUi.deletedBy", { name: r.deleter ?? t("pages.logs.system"), date: when(r.deleted_at) })}
              <div>{r.blocker ? t("legacyUi.trashKept") : t("legacyUi.purgeAt", { date: when(r.purge_at) })}</div>
              {r.delete_reason && <div>{t("legacyUi.reason")}: {r.delete_reason}</div>}
            </div>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act("restore_reservation", r.id)}><RotateCcw className="w-3 h-3" /> {t("legacyUi.restore")}</Button>
            <Button variant="outline" size="sm" disabled={!!busy || !!r.blocker} onClick={() => act("purge_reservation", r.id)} className="border-destructive/40 text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /> {t("legacyUi.purge")}</Button>
          </div>
        ))}
      </div>}
      {total > PAGE && <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("legacyUi.pageOf", { page: page + 1, pages, total })}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t("legacyUi.previous")}</Button><Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>{t("legacyUi.next")}</Button></div>
      </div>}
    </div>
  );
}
