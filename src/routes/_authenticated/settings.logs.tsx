import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs, listAuditEntities } from "@/lib/audit-logs.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, FileText, Globe, Bell, Mail, Building2, Shield, Palette, Languages, Paintbrush } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/logs")({
  head: () => ({ meta: [{ title: "Audit Logs — Pensify" }] }),
  component: AuditLogsPage,
});

const TABS = [
  { key: "general", label: "Allgemein", icon: Globe, path: "/settings" },
  { key: "language", label: "Sprache", icon: Languages, path: "/settings" },
  { key: "notifications", label: "Benachrichtigungen", icon: Bell, path: "/settings" },
  { key: "email", label: "E-Mail", icon: Mail, path: "/settings" },
  { key: "company", label: "Unternehmen", icon: Building2, path: "/settings" },
  { key: "appearance", label: "Darstellung", icon: Palette, path: "/settings" },
  { key: "channels", label: "Kanal-Farben", icon: Paintbrush, path: "/settings" },
  { key: "security", label: "Sicherheit", icon: Shield, path: "/settings" },
  { key: "logs", label: "Audit Logs", icon: FileText, path: "/settings/logs" },
];

const PAGE_SIZE = 50;

function AuditLogsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");

  const fetchLogs = useServerFn(listAuditLogs);
  const fetchEntities = useServerFn(listAuditEntities);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, entity, action],
    queryFn: () =>
      fetchLogs({
        data: {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          entity: entity || undefined,
          action: (action as "INSERT" | "UPDATE" | "DELETE" | "") || undefined,
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

  return (
    <AppShell title="Audit Logs" subtitle="Systemweite Benutzeraktionen der letzten 14 Tage">
      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
        <aside className="rounded-xl border border-border bg-card p-2 h-fit">
          {TABS.map((x) => {
            const Icon = x.icon;
            const active = x.key === "logs";
            return (
              <button
                key={x.key}
                onClick={() => navigate({ to: x.path })}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${active ? "bg-accent font-medium" : "hover:bg-accent/50 text-muted-foreground"}`}
              >
                <Icon className="w-4 h-4" /> {x.label}
              </button>
            );
          })}
        </aside>

        <div className="space-y-4">
          <Section
            title="Filter"
            action={
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={entity} onValueChange={(v) => { setEntity(v); setPage(0); }} disabled={entitiesLoading}>
                  <SelectTrigger className="w-40 text-sm">
                    <SelectValue placeholder="Entität" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Alle Entitäten</SelectItem>
                    {(entities ?? []).map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
                  <SelectTrigger className="w-36 text-sm">
                    <SelectValue placeholder="Aktion" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Alle Aktionen</SelectItem>
                    <SelectItem value="INSERT">Erstellen</SelectItem>
                    <SelectItem value="UPDATE">Ändern</SelectItem>
                    <SelectItem value="DELETE">Löschen</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => { setPage(0); setEntity(""); setAction(""); }}>
                  Zurücksetzen
                </Button>
              </div>
            }
          >
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Zeit</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Benutzer</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Entität</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Aktion</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-4 w-32" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-4 w-40" /></td>
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        Keine Logs gefunden.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                          {new Date(row.created_at).toLocaleString("de-DE")}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.actor_email || "System"}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{row.entity}</span>
                            {row.entity_id && <span className="text-xs text-muted-foreground">#{row.entity_id.slice(0, 8)}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <ActionBadge action={row.action} />
                        </td>
                        <td className="px-3 py-2">
                          <DiffSummary diff={row.diff} />
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isLoading}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || isLoading}
                >
                  Weiter <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

function ActionBadge({ action }: { action: string }) {
  const tone: Record<string, "success" | "warning" | "destructive" | "info" | "primary" | "muted"> = {
    INSERT: "success",
    UPDATE: "info",
    DELETE: "destructive",
  };
  const label: Record<string, string> = { INSERT: "Erstellen", UPDATE: "Ändern", DELETE: "Löschen" };
  return <Badge tone={tone[action] ?? "muted"}>{label[action] ?? action}</Badge>;
}

function DiffSummary({ diff }: { diff: any }) {
  if (!diff) return <span className="text-muted-foreground">—</span>;
  const oldKeys = diff?.old ? Object.keys(diff.old).length : 0;
  const newKeys = diff?.new ? Object.keys(diff.new).length : 0;
  if (oldKeys === 0 && newKeys === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-xs text-muted-foreground">
      {oldKeys > 0 && `${oldKeys} alt `}
      {oldKeys > 0 && newKeys > 0 && "→ "}
      {newKeys > 0 && `${newKeys} neu`}
    </span>
  );
}
