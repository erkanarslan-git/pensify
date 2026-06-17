import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { cities, properties, rooms, roomStatusMeta } from "@/lib/demo-data";
import { MapPin, BedDouble, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/properties")({
  head: () => ({ meta: [{ title: "Properties — Pensify" }] }),
  component: PropertiesPage,
});

function PropertiesPage() {
  return (
    <AppShell title="Properties" subtitle={`${properties.length} properties across ${cities.length} cities`}>
      <div className="space-y-6">
        {cities.map((c) => {
          const cityProps = properties.filter((p) => p.cityId === c.id);
          const cityRooms = rooms.filter((r) => cityProps.some((p) => p.id === r.propertyId));
          return (
            <div key={c.id}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <h2 className="text-base font-semibold tracking-tight">{c.name}</h2>
                <span className="text-xs text-muted-foreground">· {cityProps.length} properties · {cityRooms.length} rooms</span>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cityProps.map((p) => {
                  const pRooms = rooms.filter((r) => r.propertyId === p.id);
                  const occupied = pRooms.filter((r) => r.status === "occupied").length;
                  return (
                    <Section key={p.id} title={p.name}
                      action={<Badge tone="muted"><BedDouble className="w-3 h-3" /> {pRooms.length}</Badge>}>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {p.address}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-md bg-accent/60 p-2">
                          <div className="text-lg font-semibold">{pRooms.length}</div>
                          <div className="text-[10px] uppercase text-muted-foreground">Rooms</div>
                        </div>
                        <div className="rounded-md bg-info/10 p-2">
                          <div className="text-lg font-semibold text-info">{occupied}</div>
                          <div className="text-[10px] uppercase text-muted-foreground">Occupied</div>
                        </div>
                        <div className="rounded-md bg-success/10 p-2">
                          <div className="text-lg font-semibold text-success">{pRooms.length - occupied}</div>
                          <div className="text-[10px] uppercase text-muted-foreground">Open</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {pRooms.map((r) => {
                          const meta = roomStatusMeta[r.status];
                          return (
                            <span key={r.id} className="text-[10px] px-1.5 py-0.5 rounded border border-border" title={meta.label}>
                              {r.number}
                            </span>
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
