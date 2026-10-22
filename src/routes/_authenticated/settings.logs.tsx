import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { createFileRoute } from "@tanstack/react-router";
import { Section, Badge } from "@/components/app-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs, listAuditEntities, getAuditLog } from "@/lib/audit-logs.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, FileText, Eye, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/logs")({
  head: () => ({ meta: [{ title: "Audit Logs — Pensify" }, { name: "description", content: "Änderungen und Aktivitäten in Pensify nachverfolgen." }, { property: "og:title", content: "Audit Logs — Pensify" }, { property: "og:description", content: "Änderungen und Aktivitäten in Pensify nachverfolgen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AuditLogsContent,
});

const PAGE_SIZE = 50;

function useLocale() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("tr") ? "tr-TR" : i18n.language?.startsWith("en") ? "en-GB" : "de-DE";
}

function AuditLogsContent() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [page, setPage] = useState(0);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [email, setEmail] = useState("");
  const [entityId, setEntityId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchLogs = useServerFn(listAuditLogs);
  const fetchEntities = useServerFn(listAuditEntities);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, entity, action, email, entityId, from, to],
    queryFn: () =>
      fetchLogs({
        data: {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          entity: entity || undefined,
          action: (action as "INSERT" | "UPDATE" | "DELETE" | "") || undefined,
          email: email || undefined,
          entityId: entityId || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
        },
      }),
  });

  const { data: entities, isLoading: entitiesLoading } = useQuery({
    queryKey: ["audit-entities"],
    queryFn: () => fetchEntities(),
  });

  const total = data?.count ?? 0;
  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function reset() {
    setPage(0); setEntity(""); setAction(""); setEmail(""); setEntityId(""); setFrom(""); setTo("");
  }

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">

      <Section
        title={t("pages.logs.title")}
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5" />
            {t("pages.logs.retention")}
          </div>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setPage(0); }}
            placeholder={t("pages.logs.filterEmail")}
            className="px-3 py-2 rounded-md border border-input bg-card text-sm"
          />
          <input
            value={entityId}
            onChange={(e) => { setEntityId(e.target.value); setPage(0); }}
            placeholder={t("pages.logs.filterEntityId")}
            className="px-3 py-2 rounded-md border border-input bg-card text-sm"
          />
          <Select value={entity || "__all__"} onValueChange={(v) => { setEntity(v === "__all__" ? "" : v); setPage(0); }} disabled={entitiesLoading}>
            <SelectTrigger className="text-sm"><SelectValue placeholder={t("pages.logs.entity")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("pages.logs.allEntities")}</SelectItem>
              {(entities ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action || "__all__"} onValueChange={(v) => { setAction(v === "__all__" ? "" : v); setPage(0); }}>
            <SelectTrigger className="text-sm"><SelectValue placeholder={t("pages.logs.action")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("pages.logs.allActions")}</SelectItem>
              <SelectItem value="INSERT">{t("pages.logs.create")}</SelectItem>
              <SelectItem value="UPDATE">{t("pages.logs.update")}</SelectItem>
              <SelectItem value="DELETE">{t("pages.logs.delete")}</SelectItem>
            </SelectContent>
          </Select>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </div>
        <div className="flex justify-end mb-3">
          <Button variant="outline" size="sm" onClick={reset}>{t("pages.logs.resetFilters")}</Button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.logs.time")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.logs.user")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.logs.entity")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.logs.record")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.logs.action")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.logs.changes")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">LN</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    {t("pages.logs.noLogs")}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs">
                      {new Date(row.created_at).toLocaleString(locale, { timeZone: BUSINESS_TIME_ZONE })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.actor_email || t("pages.logs.system")}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{row.entity === "reservations" ? t("pages.logs.reservation") : row.entity}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {(row.diff as any)?.new?.guest_name ?? (row.diff as any)?.old?.guest_name ?? (row.entity_id ? shortId(row.entity_id) : "—")}
                    </td>
                    <td className="px-3 py-2"><ActionBadge action={row.action} entity={row.entity} diff={row.diff} /></td>
                    <td className="px-3 py-2"><DiffSummary diff={row.diff} /></td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setOpenId(row.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted text-xs font-mono"
                        title={t("pages.logs.showDetails")}
                      >
                        <Eye className="w-3 h-3" />
                        {shortId(row.id)}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-muted-foreground">
            {t("pages.logs.entries", { count: total, page: page + 1, pages: totalPages })}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || isLoading}>
              <ChevronLeft className="w-4 h-4 mr-1" /> {t("pages.logs.back")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || isLoading}>
              {t("pages.logs.next")} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </Section>

      <LogDetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
    </TooltipProvider>
  );

}

function shortId(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

function reservationEvent(entity?: string, diff?: any): string | null {
  if (entity !== "reservations" || !diff?.old || !diff?.new) return null;
  if (!diff.old.deleted_at && diff.new.deleted_at) return "trash";
  if (diff.old.deleted_at && !diff.new.deleted_at) return "restore";
  if (diff.old.status !== "cancelled" && diff.new.status === "cancelled") return "cancel";
  return null;
}

function ActionBadge({ action, entity, diff }: { action: string; entity?: string; diff?: any }) {
  const { t } = useTranslation();
  const ev = reservationEvent(entity, diff);
  if (ev) return <Badge tone={ev === "restore" ? "success" : "warning"}>{t(`pages.logs.${ev}`)}</Badge>;
  const tone: Record<string, "success" | "warning" | "destructive" | "info" | "primary" | "muted"> = {
    INSERT: "success", UPDATE: "info", DELETE: "destructive",
  };
  const labelKey: Record<string, string> = { INSERT: "create", UPDATE: "update", DELETE: "delete" };
  return <Badge tone={tone[action] ?? "muted"}>{labelKey[action] ? t(`pages.logs.${labelKey[action]}`) : action}</Badge>;
}

function DiffSummary({ diff }: { diff: any }) {
  const { t } = useTranslation();
  if (!diff) return <span className="text-muted-foreground">—</span>;
  const oldObj = diff?.old ?? {};
  const newObj = diff?.new ?? {};
  const keys = new Set<string>();
  Object.keys(oldObj).forEach((k) => { if (JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k])) keys.add(k); });
  Object.keys(newObj).forEach((k) => { if (JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k])) keys.add(k); });
  const list = Array.from(keys).slice(0, 3);
  if (list.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs text-muted-foreground cursor-help">
          {list.join(", ")}{keys.size > 3 ? ` +${keys.size - 3}` : ""}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <div className="text-xs font-medium mb-1">{t("pages.logs.changedFields", { count: keys.size })}</div>
        <div className="text-xs">{Array.from(keys).join(", ")}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function LogDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const fetchLog = useServerFn(getAuditLog);
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", id],
    queryFn: () => fetchLog({ data: { id: id! } }),
    enabled: !!id,
  });
  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("pages.logs.detail")}
            {data && <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">LN {shortId(data.id)}</span>}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("pages.logs.time")} value={new Date(data.created_at).toLocaleString(locale, { timeZone: BUSINESS_TIME_ZONE })} />
              <Field label={t("pages.logs.user")} value={data.actor_email || t("pages.logs.system")} />
              <Field label={t("pages.logs.entity")} value={data.entity} />
              <Field label={t("pages.logs.recordId")} value={data.entity_id || "—"} mono />
              <Field label={t("pages.logs.action")} value={<ActionBadge action={data.action} entity={data.entity} diff={data.diff} />} />
              <Field label={t("pages.logs.logId")} value={data.id} mono />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("pages.logs.before")}</div>
              <pre className="text-xs p-3 rounded-md bg-muted/60 border border-border overflow-auto max-h-64 whitespace-pre-wrap">
{JSON.stringify((data.diff as any)?.old ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("pages.logs.after")}</div>
              <pre className="text-xs p-3 rounded-md bg-muted/60 border border-border overflow-auto max-h-64 whitespace-pre-wrap">
{JSON.stringify((data.diff as any)?.new ?? null, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-sm ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</div>
    </div>
  );
}
