import { createFileRoute } from "@tanstack/react-router";
import { Section, Badge } from "@/components/app-shell";
import { useState } from "react";
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
  head: () => ({ meta: [{ title: "Audit Logs — Pensify" }] }),
  component: AuditLogsContent,
});

const PAGE_SIZE = 50;

function AuditLogsContent() {
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
        title="Audit-Protokoll"
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5" />
            Aufbewahrung: 14 Tage
          </div>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setPage(0); }}
            placeholder="Benutzer (E-Mail)…"
            className="px-3 py-2 rounded-md border border-input bg-card text-sm"
          />
          <input
            value={entityId}
            onChange={(e) => { setEntityId(e.target.value); setPage(0); }}
            placeholder="Datensatz-ID (LN)…"
            className="px-3 py-2 rounded-md border border-input bg-card text-sm"
          />
          <Select value={entity || "__all__"} onValueChange={(v) => { setEntity(v === "__all__" ? "" : v); setPage(0); }} disabled={entitiesLoading}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Entität" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Entitäten</SelectItem>
              {(entities ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action || "__all__"} onValueChange={(v) => { setAction(v === "__all__" ? "" : v); setPage(0); }}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Aktion" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alle Aktionen</SelectItem>
              <SelectItem value="INSERT">Erstellen</SelectItem>
              <SelectItem value="UPDATE">Ändern</SelectItem>
              <SelectItem value="DELETE">Löschen</SelectItem>
            </SelectContent>
          </Select>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }}
            className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
        </div>
        <div className="flex justify-end mb-3">
          <Button variant="outline" size="sm" onClick={reset}>Filter zurücksetzen</Button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Zeit</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Benutzer</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Entität</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Datensatz</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Aktion</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Änderungen</th>
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
                    Keine Logs gefunden.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs">
                      {new Date(row.created_at).toLocaleString("de-DE")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.actor_email || "System"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{row.entity}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {row.entity_id ? shortId(row.entity_id) : "—"}
                    </td>
                    <td className="px-3 py-2"><ActionBadge action={row.action} /></td>
                    <td className="px-3 py-2"><DiffSummary diff={row.diff} /></td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setOpenId(row.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted text-xs font-mono"
                        title="Details anzeigen"
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
            {total} Einträge · Seite {page + 1} von {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || isLoading}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Zurück
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || isLoading}>
              Weiter <ChevronRight className="w-4 h-4 ml-1" />
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

function ActionBadge({ action }: { action: string }) {
  const tone: Record<string, "success" | "warning" | "destructive" | "info" | "primary" | "muted"> = {
    INSERT: "success", UPDATE: "info", DELETE: "destructive",
  };
  const label: Record<string, string> = { INSERT: "Erstellen", UPDATE: "Ändern", DELETE: "Löschen" };
  return <Badge tone={tone[action] ?? "muted"}>{label[action] ?? action}</Badge>;
}

function DiffSummary({ diff }: { diff: any }) {
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
        <div className="text-xs font-medium mb-1">Geänderte Felder ({keys.size})</div>
        <div className="text-xs">{Array.from(keys).join(", ")}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function LogDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
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
            Log-Detail
            {data && <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">LN {shortId(data.id)}</span>}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zeit" value={new Date(data.created_at).toLocaleString("de-DE")} />
              <Field label="Benutzer" value={data.actor_email || "System"} />
              <Field label="Entität" value={data.entity} />
              <Field label="Datensatz-ID" value={data.entity_id || "—"} mono />
              <Field label="Aktion" value={<ActionBadge action={data.action} />} />
              <Field label="Log-ID" value={data.id} mono />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Vorher</div>
              <pre className="text-xs p-3 rounded-md bg-muted/60 border border-border overflow-auto max-h-64 whitespace-pre-wrap">
{JSON.stringify((data.diff as any)?.old ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Nachher</div>
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
