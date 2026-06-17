import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import {
  cleaningTasks as initialTasks, getRoom, getProperty, getCleaner,
  cleaningStatusMeta, type CleaningTask, type CleaningStatus,
} from "@/lib/demo-data";
import { useState } from "react";
import { Camera, Check, Play, AlertTriangle, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/cleaning")({
  head: () => ({ meta: [{ title: "Cleaning — Pensify" }] }),
  component: CleaningPage,
});

function CleaningPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<CleaningTask[]>(initialTasks);
  const [filter, setFilter] = useState<CleaningStatus | "all">("all");

  const update = (id: string, status: CleaningStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    toast.success(`Task marked as ${cleaningStatusMeta[status].label}`);
  };

  const list = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <AppShell title={t("pages.cleaning.title")} subtitle="Auto-created on each checkout">
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
        >
          All ({tasks.length})
        </button>
        {(Object.keys(cleaningStatusMeta) as CleaningStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
          >
            {cleaningStatusMeta[s].label} ({tasks.filter((t) => t.status === s).length})
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((t) => {
          const room = getRoom(t.roomId);
          const prop = getProperty(t.propertyId);
          const cleaner = getCleaner(t.cleanerId);
          const meta = cleaningStatusMeta[t.status];
          const due = new Date(t.dueTime);
          return (
            <div key={t.id} className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">{prop?.name}</div>
                  <div className="text-lg font-semibold tracking-tight">Room #{room?.number}</div>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due</span>
                  <span className="font-medium">{due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cleaner</span>
                  <span className="font-medium">{cleaner?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Photos</span>
                  <span className="font-medium inline-flex items-center gap-1"><Camera className="w-3 h-3" />{t.photos}</span>
                </div>
                {t.notes && (
                  <div className="text-xs text-muted-foreground italic pt-1">"{t.notes}"</div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <button onClick={() => update(t.id, "accepted")} className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> Accept
                </button>
                <button onClick={() => update(t.id, "in_progress")} className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1">
                  <Play className="w-3 h-3" /> Start
                </button>
                <button onClick={() => update(t.id, "completed")} className="text-xs px-2.5 py-1.5 rounded-md bg-success text-success-foreground hover:opacity-90 inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> Complete
                </button>
                <button onClick={() => update(t.id, "problem")} className="text-xs px-2.5 py-1.5 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/5 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Problem
                </button>
                <button onClick={() => toast.info(`WhatsApp sent to ${cleaner?.name}`)} className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1 ml-auto">
                  <MessageCircle className="w-3 h-3" /> Notify
                </button>
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <Section title="No tasks"><div className="text-sm text-muted-foreground">No cleaning tasks match this filter.</div></Section>
        )}
      </div>
    </AppShell>
  );
}
