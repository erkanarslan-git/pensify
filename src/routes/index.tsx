import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Kpi, Section, Badge } from "@/components/app-shell";
import {
  rooms, reservations, cleaningTasks, properties, getRoom, getProperty,
  roomStatusMeta, cleaningStatusMeta,
} from "@/lib/demo-data";
import { ArrowUpRight, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — StayFlow" },
      { name: "description", content: "Daily operations overview for your properties." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const totalRooms = rooms.length;
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const available = rooms.filter((r) => r.status === "available").length;
  const cleaningPending = cleaningTasks.filter((t) => t.status === "pending").length;
  const cleaningInProgress = cleaningTasks.filter((t) => t.status === "in_progress").length;
  const completedToday = cleaningTasks.filter((t) => t.status === "completed").length;
  const upcomingCheckouts = reservations
    .filter((r) => r.checkOut >= today)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))
    .slice(0, 6);

  return (
    <AppShell
      title="Dashboard"
      subtitle="Today's operations across all properties"
      actions={
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" /> New reservation
        </button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Rooms" value={totalRooms} hint={`${properties.length} properties`} />
        <Kpi label="Occupied" value={occupied} hint={`${Math.round((occupied / totalRooms) * 100)}% occupancy`} accent="info" />
        <Kpi label="Available" value={available} accent="success" />
        <Kpi label="Cleaning Pending" value={cleaningPending} accent="warning" />
        <Kpi label="Cleaning In Progress" value={cleaningInProgress} accent="primary" />
        <Kpi label="Completed Today" value={completedToday} accent="success" />
        <Kpi label="Check-outs Today" value={rooms.filter((r) => r.status === "checkout_today").length} accent="warning" />
        <Kpi label="Maintenance" value={rooms.filter((r) => r.status === "maintenance").length} accent="destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <Section
            title="Upcoming check-outs"
            action={
              <Link to="/reservations" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            }
          >
            <div className="divide-y divide-border -my-2">
              {upcomingCheckouts.map((r) => {
                const room = getRoom(r.roomId);
                const prop = room ? getProperty(room.propertyId) : null;
                return (
                  <div key={r.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-accent grid place-items-center text-xs font-semibold shrink-0">
                        {r.guestName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.guestName}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {prop?.name} · Room {room?.number} · {r.source}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{r.checkOut}</div>
                      <div className="text-xs text-muted-foreground">{r.guests} guests</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <Section title="Active cleaning tasks">
          <div className="space-y-3">
            {cleaningTasks.slice(0, 6).map((t) => {
              const room = getRoom(t.roomId);
              const prop = getProperty(t.propertyId);
              const meta = cleaningStatusMeta[t.status];
              return (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {prop?.name} · Room {room?.number}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Due {new Date(t.dueTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Room status overview" action={<Link to="/rooms" className="text-xs text-primary hover:underline">All rooms</Link>}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {rooms.slice(0, 18).map((r) => {
              const meta = roomStatusMeta[r.status];
              const prop = getProperty(r.propertyId);
              return (
                <div key={r.id} className="rounded-lg border border-border p-3 hover:shadow-soft transition-shadow">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">#{r.number}</span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">{prop?.name}</div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
