import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { AlertTriangle, Clock, Wrench, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Eylem Merkezi — Pensify" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["notifications-live", today],
    queryFn: async () => {
      const [checkouts, delayed, problems, maint] = await Promise.all([
        supabase
          .from("reservations")
          .select("id,guest_name,check_out,room:rooms(number),property:properties(name)")
          .gte("check_out", today).lte("check_out", in7)
          .neq("status", "cancelled")
          .order("check_out").limit(10),
        supabase
          .from("cleaning_tasks")
          .select("id,due_at,room:rooms(number),property:properties(name)")
          .eq("status", "pending")
          .lt("due_at", new Date().toISOString())
          .limit(10),
        supabase
          .from("cleaning_tasks")
          .select("id,notes,room:rooms(number),property:properties(name)")
          .eq("status", "problem").limit(10),
        supabase
          .from("rooms")
          .select("id,number,property:properties(name)")
          .eq("status", "maintenance").limit(10),
      ]);
      return {
        checkouts: (checkouts.data ?? []) as any[],
        delayed: (delayed.data ?? []) as any[],
        problems: (problems.data ?? []) as any[],
        maint: (maint.data ?? []) as any[],
      };
    },
  });

  const Group = ({ title, icon: Icon, tone, children }: { title: string; icon: any; tone: "warning" | "destructive" | "muted"; children: React.ReactNode }) => {
    const toneClass: Record<string, string> = {
      warning: "bg-warning/15 text-warning-foreground",
      destructive: "bg-destructive/10 text-destructive",
      muted: "bg-muted text-muted-foreground",
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

  const Empty = ({ text }: { text: string }) => (
    <div className="px-5 py-6 text-sm text-muted-foreground">{text}</div>
  );

  return (
    <AppShell title={t("pages.notifications.title")} subtitle="Was heute Aufmerksamkeit braucht">
      <div className="grid lg:grid-cols-2 gap-4">
        <Group title="Anstehende Check-outs (7 Tage)" icon={LogOut} tone="warning">
          {(data?.checkouts ?? []).map((r) => (
            <Item key={r.id} title={`${r.guest_name} — Zimmer ${r.room?.number ?? "?"}`}
              sub={`${r.property?.name ?? ""} · ${r.check_out}`}
              badge={<Badge tone="warning">{r.check_out}</Badge>} />
          ))}
          {(!data?.checkouts?.length) && <Empty text="Keine Check-outs in den nächsten 7 Tagen" />}
        </Group>

        <Group title="Verspätete Reinigungen" icon={Clock} tone="destructive">
          {(data?.delayed ?? []).map((t) => (
            <Item key={t.id} title={`Zimmer ${t.room?.number ?? "?"} — ${t.property?.name ?? ""}`}
              sub={`Fällig seit ${new Date(t.due_at).toLocaleString()}`}
              badge={<Badge tone="destructive">Überfällig</Badge>} />
          ))}
          {(!data?.delayed?.length) && <Empty text="Alles im Zeitplan" />}
        </Group>

        <Group title="Problemmeldungen" icon={AlertTriangle} tone="destructive">
          {(data?.problems ?? []).map((t) => (
            <Item key={t.id} title={`Zimmer ${t.room?.number ?? "?"}`}
              sub={`${t.property?.name ?? ""} · ${t.notes ?? "Problem gemeldet"}`}
              badge={<Badge tone="destructive">Aktion nötig</Badge>} />
          ))}
          {(!data?.problems?.length) && <Empty text="Keine Probleme gemeldet" />}
        </Group>

        <Group title="Wartung" icon={Wrench} tone="muted">
          {(data?.maint ?? []).map((r) => (
            <Item key={r.id} title={`Zimmer ${r.number}`}
              sub={`${r.property?.name ?? ""} · außer Betrieb`}
              badge={<Badge tone="muted">Wartung</Badge>} />
          ))}
          {(!data?.maint?.length) && <Empty text="Keine Warnungen" />}
        </Group>
      </div>
    </AppShell>
  );
}
