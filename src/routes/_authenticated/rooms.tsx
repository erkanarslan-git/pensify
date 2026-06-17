import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { rooms, properties, cities, getProperty, roomStatusMeta, type RoomStatus } from "@/lib/demo-data";
import { useState } from "react";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({ meta: [{ title: "Rooms — Pensify" }] }),
  component: RoomsPage,
});

function RoomsPage() {
  const [filter, setFilter] = useState<RoomStatus | "all">("all");
  const list = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);

  return (
    <AppShell title="Room Status" subtitle={`${rooms.length} rooms in ${properties.length} properties`}>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
        >
          All ({rooms.length})
        </button>
        {(Object.keys(roomStatusMeta) as RoomStatus[]).map((s) => {
          const count = rooms.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
            >
              {roomStatusMeta[s].label} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {cities.map((city) => {
          const cityProps = properties.filter((p) => p.cityId === city.id);
          return (
            <div key={city.id}>
              <h3 className="text-sm font-semibold tracking-tight mb-3">{city.name}</h3>
              <div className="space-y-4">
                {cityProps.map((p) => {
                  const propRooms = list.filter((r) => r.propertyId === p.id);
                  if (propRooms.length === 0) return null;
                  return (
                    <Section key={p.id} title={p.name} action={<span className="text-xs text-muted-foreground">{p.address}</span>}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {propRooms.map((r) => {
                          const meta = roomStatusMeta[r.status];
                          return (
                            <div key={r.id} className="rounded-lg border border-border p-3 bg-card hover:shadow-elevated transition-shadow">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold">#{r.number}</span>
                                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                  <Users className="w-3 h-3" />{r.capacity}
                                </span>
                              </div>
                              <div className="mt-2">
                                <Badge tone={meta.tone}>{meta.label}</Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Section>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
