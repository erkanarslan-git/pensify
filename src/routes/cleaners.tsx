import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { cleaners, cities, cleaningTasks, getCity } from "@/lib/demo-data";
import { Phone, MapPin, Plus } from "lucide-react";

export const Route = createFileRoute("/cleaners")({
  head: () => ({ meta: [{ title: "Cleaners — StayFlow" }] }),
  component: CleanersPage,
});

function CleanersPage() {
  return (
    <AppShell title="Cleaners" subtitle={`${cleaners.filter((c) => c.active).length} active staff`}
      actions={
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add cleaner
        </button>
      }>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cleaners.map((c) => {
          const assigned = cleaningTasks.filter((t) => t.cleanerId === c.id);
          return (
            <div key={c.id} className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-semibold">
                  {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold tracking-tight">{c.name}</h3>
                    <Badge tone={c.active ? "success" : "muted"}>{c.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {c.phone}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-xs uppercase text-muted-foreground font-medium mb-1.5">Regions</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.regions.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent text-xs">
                      <MapPin className="w-3 h-3" /> {getCity(r)?.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex justify-between text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Today's tasks</div>
                  <div className="font-semibold">{assigned.length}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                  <div className="font-semibold text-success">{assigned.filter((a) => a.status === "completed").length}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">In progress</div>
                  <div className="font-semibold text-primary">{assigned.filter((a) => a.status === "in_progress").length}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Section title="Coverage by city">
          <div className="grid sm:grid-cols-3 gap-4">
            {cities.map((c) => {
              const coverage = cleaners.filter((cl) => cl.active && cl.regions.includes(c.id));
              return (
                <div key={c.id} className="rounded-lg border border-border p-4">
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{coverage.length} active cleaners</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {coverage.map((cl) => (
                      <span key={cl.id} className="text-xs px-2 py-0.5 rounded-full bg-accent">{cl.name.split(" ")[0]}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
