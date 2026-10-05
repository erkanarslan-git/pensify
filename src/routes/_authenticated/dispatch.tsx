import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getTodayDispatch } from "@/lib/dispatch.functions";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";


export const Route = createFileRoute("/_authenticated/dispatch")({
  head: () => ({ meta: [{ title: "Aufgabenverteilung — Pensify" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const fetchToday = useServerFn(getTodayDispatch);

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch", "today"],
    queryFn: () => fetchToday(),
  });

  const [previewBody, setPreviewBody] = useState<string | null>(null);


  if (isLoading) return <AppShell title="Aufgabenverteilung">Laden…</AppShell>;
  if (!data) return null;

  const s = data.settings as Record<string, any>;
  const morningTime = s["dispatch.morning_time"] || "08:00";
  const timezone = s["dispatch.timezone"] || "Europe/Berlin";
  const enabled = s["dispatch.enabled"] === true;

  // group tasks per cleaner
  const tasksByCleaner = new Map<string, any[]>();
  for (const t of data.tasks) {
    if (!t.cleaner_id) continue;
    if (!tasksByCleaner.has(t.cleaner_id)) tasksByCleaner.set(t.cleaner_id, []);
    tasksByCleaner.get(t.cleaner_id)!.push(t);
  }
  const msgByCleaner = new Map<string, any>();
  for (const m of data.messages) {
    if (!msgByCleaner.has(m.cleaner_id)) msgByCleaner.set(m.cleaner_id, m);
  }

  const unassigned = data.tasks.filter((t: any) => !t.cleaner_id);

  return (
    <AppShell
      title="Aufgabenverteilung"
      subtitle={`Heute ${data.scheduledFor} · ${enabled ? "Automatisch an" : "Automatisch aus"} · ${morningTime} ${timezone}`}
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Kpi label="Aktive Reinigungskräfte" value={data.cleaners.length} />
          <Kpi label="Aufgaben heute" value={data.tasks.length} />
          <Kpi label="Gesendete Nachrichten" value={data.messages.length} />
        </div>

        <Section title="Reinigungskräfte">
          <div className="grid md:grid-cols-2 gap-3">
            {data.cleaners.map((c: any) => {
              const tasks = tasksByCleaner.get(c.id) ?? [];
              const msg = msgByCleaner.get(c.id);
              const counts = { pending: 0, in_progress: 0, completed: 0 };
              for (const t of tasks) {
                // "accepted" tasks (cleaner acknowledged but not started) count as pending in the UI
                const key = t.status === "accepted" ? "pending" : t.status;
                (counts as any)[key] = ((counts as any)[key] ?? 0) + 1;
              }
              return (
                <div key={c.id} className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone ?? "kein Telefon"}</div>
                    </div>
                    {msg ? <Badge tone="success">Gesendet · {new Date(msg.sent_at).toLocaleTimeString()}</Badge> : <Badge tone="muted">Noch nicht gesendet</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge tone="warning">{counts.pending} offen</Badge>
                    <Badge tone="info">{counts.in_progress} läuft</Badge>
                    <Badge tone="success">{counts.completed} fertig</Badge>
                  </div>
                  {tasks.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {tasks.slice(0, 6).map((t: any, i: number) => (
                        <li key={t.id} className="rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              <span className="text-muted-foreground">{i + 1}.</span>{" "}
                              <span className="font-medium">{t.properties?.name}</span> · Zimmer {t.rooms?.number}
                            </span>
                            <TaskStatusBadge status={t.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {msg && (
                      <Button size="sm" variant="ghost" onClick={() => setPreviewBody(msg.body)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Nachricht ansehen
                      </Button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </Section>

        {unassigned.length > 0 && (
          <Section title={`Nicht zugewiesene Aufgaben (${unassigned.length})`}>
            <ul className="text-sm space-y-1">
              {unassigned.map((t: any) => (
                <li key={t.id} className="text-muted-foreground">
                  {t.properties?.name} – Zimmer {t.rooms?.number} · {t.status}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2">Zum Zuweisen einer Reinigungskraft bitte die Seite „Reinigung" verwenden.</p>
          </Section>
        )}
      </div>

      <Dialog open={previewBody != null} onOpenChange={(o) => !o && setPreviewBody(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>WhatsApp-Nachricht Vorschau</DialogTitle></DialogHeader>
          <pre className="text-sm bg-muted rounded-lg p-4 whitespace-pre-wrap font-sans">{previewBody}</pre>
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "muted" | "info" | "success" | "warning" | "destructive"; label: string }> = {
    pending: { tone: "muted", label: "Offen" },
    accepted: { tone: "info", label: "Angenommen" },
    in_progress: { tone: "info", label: "Läuft" },
    completed: { tone: "success", label: "Fertig" },
    problem: { tone: "destructive", label: "Problem" },
  };
  const m = map[status] ?? { tone: "muted" as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}


function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

