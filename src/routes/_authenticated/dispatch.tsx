import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { getTodayDispatch } from "@/lib/dispatch.functions";
import { Eye, Users, ClipboardList, MessageCircle, UserX, Clock, ChevronDown, ArrowRight, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dispatchTranslations } from "@/i18n/dispatch";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";

export const Route = createFileRoute("/_authenticated/dispatch")({
  head: () => ({ meta: [{ title: "Aufgabenverteilung — Pension Highway" }, { name: "description", content: "Tägliche Reinigungsaufgaben in Pension Highway verteilen." }, { property: "og:title", content: "Aufgabenverteilung — Pension Highway" }, { property: "og:description", content: "Tägliche Reinigungsaufgaben in Pension Highway verteilen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith("tr") ? "tr" : i18n.language.startsWith("en") ? "en" : "de";
  const copy = dispatchTranslations[lang];
  const fetchToday = useServerFn(getTodayDispatch);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["dispatch", "today"], queryFn: () => fetchToday() });
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  if (isLoading) return <AppShell title={copy.title}><p className="text-muted-foreground">{copy.loading}</p></AppShell>;
  if (error || !data) return <AppShell title={copy.title}><p className="text-destructive mb-3">{copy.error}</p><Button variant="outline" onClick={() => refetch()}>{copy.retry}</Button></AppShell>;

  const settings = data.settings as Record<string, unknown>;
  const morningTime = String(settings["dispatch.morning_time"] || "08:00");
  const timezone = BUSINESS_TIME_ZONE;
  const enabled = settings["dispatch.enabled"] === true;
  const unassigned = data.tasks.filter((task) => !task.cleaner_id);
  const date = data.scheduledFor.split("-").reverse().join(".");

  return (
    <AppShell title={copy.title} subtitle={`${copy.subtitle} · ${date}`} actions={<Button asChild variant="outline" size="sm"><Link to="/cleaning" aria-label={copy.assign} title={copy.assign}><span className="hidden sm:inline">{copy.assign}</span><ArrowRight className="h-4 w-4 sm:ml-2" /></Link></Button>}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi icon={ClipboardList} label={copy.tasks} value={data.tasks.length} highlight />
        <Kpi icon={Users} label={copy.employees} value={data.cleaners.length} />
        <Kpi icon={MessageCircle} label={copy.messages} value={data.messages.length} />
        <Kpi icon={UserX} label={copy.unassigned} value={unassigned.length} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:justify-between items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-6">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary"><Clock className="h-4 w-4 shrink-0" /><span>{enabled ? copy.autoOn : copy.autoOff}</span></div>
        <span className="text-xs text-muted-foreground text-right">{morningTime}<span className="block sm:inline sm:ml-2">{copy.germanyTime}</span></span>
      </div>
      {unassigned.length > 0 && <section className="mb-6">
        <div className="flex items-center gap-2 mb-3"><UserX className="h-4 w-4 text-warning" /><h2 className="font-semibold">{copy.unassigned}</h2><Badge tone="warning">{unassigned.length}</Badge></div>
        <ul className="divide-y divide-border border-y border-border">
          {unassigned.map((task) => <li key={task.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 text-sm"><span className="min-w-0 break-words">{task.properties?.name} · {copy.room} {task.rooms?.number}</span><TaskStatusBadge status={task.status} lang={lang} /></li>)}
        </ul>
      </section>}
      <section>
        <div className="flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-primary" /><h2 className="font-semibold">{copy.team}</h2><Badge tone="info">{data.cleaners.length}</Badge></div>
        <div className="border-y border-border divide-y divide-border">
          {data.cleaners.map((cleaner) => {
            const tasks = data.tasks.filter((task) => task.cleaner_id === cleaner.id);
            const message = data.messages.find((msg) => msg.cleaner_id === cleaner.id);
            return <details key={cleaner.id} className="group" open={tasks.length > 0}>
              <summary className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-4 cursor-pointer list-none">
                <div className="flex items-center min-w-0 gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center font-semibold text-sm">{cleaner.full_name.split(" ").filter(Boolean).slice(0,2).map((name) => name[0]).join("")}</div>
                  <div className="min-w-0"><p className="font-medium break-words">{cleaner.full_name}</p><p className="text-xs text-muted-foreground">{cleaner.phone || copy.noPhone}</p></div>
                </div>
                <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{tasks.length} {copy.tasks.toLocaleLowerCase(lang)}</span><ChevronDown className="h-4 w-4 shrink-0 text-primary group-open:rotate-180 transition-transform" /></div>
              </summary>
              <div className="pb-4 sm:pl-13">
                <ul className="divide-y divide-border">
                  {tasks.map((task) => <li key={task.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-sm"><span className="min-w-0 break-words">{task.properties?.name} · {copy.room} {task.rooms?.number}</span><TaskStatusBadge status={task.status} lang={lang} /></li>)}
                </ul>
                {tasks.length === 0 && <p className="text-sm text-muted-foreground py-2">{copy.noTasks}</p>}
                <div className="flex flex-wrap gap-3 items-center pt-3">
                  {message ? <><Badge tone={message.provider === "simulation" ? "muted" : message.status === "sent" ? "success" : message.status === "failed" ? "destructive" : "muted"}>{message.provider === "simulation" ? copy.simulation : message.status === "sent" ? copy.sent : message.status === "failed" ? copy.failed : message.status} · {message.sent_at ? new Date(message.sent_at).toLocaleTimeString(lang, {timeZone: timezone, hour: "2-digit", minute: "2-digit"}) : "—"}</Badge><Button size="sm" variant="outline" onClick={() => setPreviewBody(message.body)}><Eye className="h-4 w-4 mr-2" />{copy.preview}</Button></> : <span className="text-xs text-muted-foreground">{copy.noMessage}</span>}
                </div>
              </div>
            </details>;
          })}
          {data.cleaners.length === 0 && <p className="py-8 text-sm text-muted-foreground">{copy.noTeam}</p>}
        </div>
      </section>
      <Dialog open={previewBody !== null} onOpenChange={(open) => { if (!open) setPreviewBody(null); }}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{copy.previewTitle}</DialogTitle></DialogHeader><pre className="text-sm bg-muted rounded-lg p-4 whitespace-pre-wrap break-words font-sans max-h-[60vh] overflow-y-auto">{previewBody}</pre></DialogContent>
      </Dialog>
    </AppShell>
  );
}

function TaskStatusBadge({ status, lang }: { status: string; lang: keyof typeof dispatchTranslations }) {
  const tones = { pending: "muted", accepted: "info", in_progress: "info", completed: "success", problem: "destructive" } as const;
  const key = status in tones ? status as keyof typeof tones : null;
  return <Badge tone={key ? tones[key] : "muted"}>{key ? dispatchTranslations[lang][key] : status}</Badge>;
}

function Kpi({ icon: Icon, label, value, highlight }: { icon: LucideIcon; label: string; value: number; highlight?: boolean }) {
  return <div className={`rounded-2xl px-5 py-4 min-w-0 ${highlight ? "brand-tile" : "border border-border bg-card"}`}><div className={`flex items-center gap-2 text-xs ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}><Icon className="h-4 w-4 shrink-0" />{label}</div><div className="text-3xl font-semibold mt-2 tabular-nums">{value}</div></div>;
}
