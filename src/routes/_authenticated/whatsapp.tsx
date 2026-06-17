import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { cleaningTasks, cleaners, getRoom, getProperty, getCleaner, cleaningStatusMeta, type CleaningStatus } from "@/lib/demo-data";
import { useState } from "react";
import { MessageCircle, Send, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Pensify" }] }),
  component: WhatsAppPage,
});

interface Msg {
  id: string;
  from: "system" | "cleaner";
  text: string;
  time: string;
  actions?: { label: string; status: CleaningStatus }[];
}

function WhatsAppPage() {
  const [selectedCleanerId, setSelectedCleanerId] = useState(cleaners[0].id);
  const cleaner = getCleaner(selectedCleanerId)!;
  const cleanerTasks = cleaningTasks.filter((t) => t.cleanerId === selectedCleanerId);

  const initialMessages: Msg[] = cleanerTasks.slice(0, 3).flatMap((t) => {
    const room = getRoom(t.roomId);
    const prop = getProperty(t.propertyId);
    const due = new Date(t.dueTime);
    const baseMsg: Msg = {
      id: `m-${t.id}`,
      from: "system",
      text: `🧹 *New Cleaning Task*\n\nProperty: ${prop?.name}\nRoom: ${room?.number}\nCheckout: ${due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      time: "09:14",
      actions: [
        { label: "Accept", status: "accepted" },
        { label: "Start", status: "in_progress" },
        { label: "Complete", status: "completed" },
        { label: "Report Problem", status: "problem" },
      ],
    };
    if (t.status === "completed") {
      return [baseMsg, {
        id: `m-${t.id}-r`,
        from: "cleaner",
        text: `✅ Done with room ${room?.number}`,
        time: "10:42",
      }];
    }
    if (t.status === "in_progress") {
      return [baseMsg, {
        id: `m-${t.id}-r`,
        from: "cleaner",
        text: `Started cleaning room ${room?.number}`,
        time: "11:05",
      }];
    }
    return [baseMsg];
  });

  const [messages, setMessages] = useState<Msg[]>(initialMessages);

  const simulateReply = (status: CleaningStatus, room?: string) => {
    const map: Record<CleaningStatus, string> = {
      accepted: `👍 Accepted`,
      in_progress: `Started cleaning room ${room ?? ""}`.trim(),
      completed: `✅ Room ${room ?? ""} done!`,
      problem: `⚠️ Problem in room ${room ?? ""} — please check`,
      pending: "",
    };
    setMessages((prev) => [...prev, {
      id: `m-r-${Date.now()}`,
      from: "cleaner",
      text: map[status],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
  };

  return (
    <AppShell title="WhatsApp Workflow" subtitle="Simulated cleaner communication channel">
      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <Section title="Cleaners">
          <div className="space-y-1 -m-2">
            {cleaners.filter((c) => c.active).map((c) => {
              const isActive = c.id === selectedCleanerId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCleanerId(c.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${isActive ? "bg-accent" : "hover:bg-accent/60"}`}
                >
                  <div className="w-9 h-9 rounded-full bg-success/15 text-success grid place-items-center text-xs font-semibold shrink-0">
                    {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.phone}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <div className="rounded-xl border border-border bg-card shadow-soft flex flex-col h-[640px]">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-success/15 text-success grid place-items-center text-xs font-semibold">
              {cleaner.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-semibold">{cleaner.name}</div>
              <div className="text-xs text-success">online</div>
            </div>
            <Badge tone="success"><MessageCircle className="w-3 h-3" /> WhatsApp</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.85 0 0 / 0.2) 1px, transparent 0)",
            backgroundSize: "16px 16px",
          }}>
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === "cleaner" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-soft text-sm whitespace-pre-line ${
                  m.from === "cleaner"
                    ? "bg-success/15 text-foreground rounded-br-sm"
                    : "bg-card border border-border rounded-bl-sm"
                }`}>
                  {m.text}
                  {m.actions && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.actions.map((a) => (
                        <button
                          key={a.label}
                          onClick={() => simulateReply(a.status)}
                          className="text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-accent"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground text-right mt-1 inline-flex items-center gap-0.5 w-full justify-end">
                    {m.time}
                    {m.from === "system" && <CheckCheck className="w-3 h-3 text-info" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-border flex items-center gap-2">
            <input className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm" placeholder="Type a message…" disabled />
            <button className="w-9 h-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <Section title={`${cleaner.name}'s active tasks`}>
          <div className="space-y-2">
            {cleanerTasks.map((t) => {
              const room = getRoom(t.roomId);
              const prop = getProperty(t.propertyId);
              return (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{prop?.name} · Room {room?.number}</div>
                    <div className="text-xs text-muted-foreground">Due {new Date(t.dueTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <Badge tone={cleaningStatusMeta[t.status].tone}>{cleaningStatusMeta[t.status].label}</Badge>
                </div>
              );
            })}
            {cleanerTasks.length === 0 && <div className="text-sm text-muted-foreground">No assigned tasks</div>}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
