import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { reservations, cleaningTasks, rooms, getRoom, getProperty } from "@/lib/demo-data";
import { AlertTriangle, Clock, Wrench, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Pensify" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const upcomingCheckouts = reservations.filter((r) => r.checkOut >= today).slice(0, 5);
  const delayed = cleaningTasks.filter((t) => t.status === "pending").slice(0, 4);
  const problems = cleaningTasks.filter((t) => t.status === "problem");
  const maintenance = rooms.filter((r) => r.status === "maintenance");

  const Group = ({ title, icon: Icon, tone, children }: { title: string; icon: any; tone: "warning" | "destructive" | "muted" | "primary" | "info" | "success"; children: React.ReactNode }) => {
    const toneClass: Record<string, string> = {
      warning: "bg-warning/15 text-warning-foreground",
      destructive: "bg-destructive/10 text-destructive",
      muted: "bg-muted text-muted-foreground",
      primary: "bg-primary/10 text-primary",
      info: "bg-info/10 text-info",
      success: "bg-success/10 text-success",
    };
    return (
      <div className="rounded-xl border border-border bg-card shadow-soft">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <span className={`w-7 h-7 rounded-md grid place-items-center ${toneClass[tone]}`}>
            <Icon className="w-4 h-4" />
          </span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="divide-y divide-border">{children}</div>
      </div>
    );
  };

  const Item = ({ title, sub, badge }: { title: string; sub: string; badge?: React.ReactNode }) => (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      {badge}
    </div>
  );

  return (
    <AppShell title={t("pages.notifications.title")} subtitle="Stay on top of what needs attention">
      <div className="grid lg:grid-cols-2 gap-4">
        <Group title="Upcoming check-outs" icon={LogOut} tone="warning">
          {upcomingCheckouts.map((r) => {
            const room = getRoom(r.roomId);
            const prop = room ? getProperty(room.propertyId) : null;
            return (
              <Item key={r.id} title={`${r.guestName} — Room ${room?.number}`}
                sub={`${prop?.name} · checkout ${r.checkOut}`}
                badge={<Badge tone="warning">{r.checkOut}</Badge>}
              />
            );
          })}
        </Group>

        <Group title="Delayed cleaning tasks" icon={Clock} tone="destructive">
          {delayed.map((t) => {
            const room = getRoom(t.roomId);
            const prop = getProperty(t.propertyId);
            return (
              <Item key={t.id} title={`Room ${room?.number} — ${prop?.name}`}
                sub={`Pending since ${new Date(t.dueTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                badge={<Badge tone="destructive">Overdue</Badge>}
              />
            );
          })}
          {delayed.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground">All caught up</div>}
        </Group>

        <Group title="Problem reports" icon={AlertTriangle} tone="destructive">
          {problems.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">No problems reported</div>
          ) : problems.map((t) => {
            const room = getRoom(t.roomId);
            const prop = getProperty(t.propertyId);
            return (
              <Item key={t.id} title={`Room ${room?.number}`}
                sub={`${prop?.name} · ${t.notes ?? "Cleaner reported issue"}`}
                badge={<Badge tone="destructive">Action needed</Badge>}
              />
            );
          })}
        </Group>

        <Group title="Maintenance alerts" icon={Wrench} tone="muted">
          {maintenance.map((r) => {
            const prop = getProperty(r.propertyId);
            return (
              <Item key={r.id} title={`Room ${r.number}`}
                sub={`${prop?.name} · out of service`}
                badge={<Badge tone="muted">Maintenance</Badge>}
              />
            );
          })}
          {maintenance.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground">No alerts</div>}
        </Group>
      </div>
    </AppShell>
  );
}
