import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { AlertTriangle, Clock, Wrench, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Eylem Merkezi — Pensify" }, { name: "description", content: "Pensify'da bugün dikkat gerektiren görevler ve uyarılar." }, { property: "og:title", content: "Eylem Merkezi — Pensify" }, { property: "og:description", content: "Pensify'da bugün dikkat gerektiren görevler ve uyarılar." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const locale = i18n.language?.startsWith("tr") ? "tr-TR" : i18n.language?.startsWith("en") ? "en-GB" : "de-DE";

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
          .select("id,number,status_changed_by,status_changed_at,property:properties(name)")
          .eq("status", "maintenance").limit(10),
      ]);
      const maintRooms = (maint.data ?? []) as any[];
      const userIds = [...new Set(maintRooms.map((r) => r.status_changed_by).filter(Boolean))];
      let names: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", userIds);
        names = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
      }
      return {
        checkouts: (checkouts.data ?? []) as any[],
        delayed: (delayed.data ?? []) as any[],
        problems: (problems.data ?? []) as any[],
        maint: maintRooms,
        names,
      };
    },
  });

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { timeZone: BUSINESS_TIME_ZONE, dateStyle: "short", timeStyle: "short" });

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
    <AppShell title={t("pages.notifications.title")} subtitle={t("pages.notifications.subtitle")}>
      <div className="grid lg:grid-cols-2 gap-4">
        <Group title={t("pages.notifications.upcomingCheckouts")} icon={LogOut} tone="warning">
          {(data?.checkouts ?? []).map((r) => (
            <Item key={r.id} title={`${r.guest_name} — ${t("pages.notifications.room")} ${r.room?.number ?? "?"}`}
              sub={`${r.property?.name ?? ""} · ${r.check_out}`}
              badge={<Badge tone="warning">{r.check_out}</Badge>} />
          ))}
          {(!data?.checkouts?.length) && <Empty text={t("pages.notifications.noCheckouts")} />}
        </Group>

        <Group title={t("pages.notifications.delayedCleanings")} icon={Clock} tone="destructive">
          {(data?.delayed ?? []).map((task) => (
            <Item key={task.id} title={`${t("pages.notifications.room")} ${task.room?.number ?? "?"} — ${task.property?.name ?? ""}`}
              sub={t("pages.notifications.dueSince", { date: fmtDateTime(task.due_at) })}
              badge={<Badge tone="destructive">{t("pages.notifications.overdue")}</Badge>} />
          ))}
          {(!data?.delayed?.length) && <Empty text={t("pages.notifications.allOnTime")} />}
        </Group>

        <Group title={t("pages.notifications.problemReports")} icon={AlertTriangle} tone="destructive">
          {(data?.problems ?? []).map((task) => (
            <Item key={task.id} title={`${t("pages.notifications.room")} ${task.room?.number ?? "?"}`}
              sub={`${task.property?.name ?? ""} · ${task.notes ?? t("pages.notifications.problemReported")}`}
              badge={<Badge tone="destructive">{t("pages.notifications.actionNeeded")}</Badge>} />
          ))}
          {(!data?.problems?.length) && <Empty text={t("pages.notifications.noProblems")} />}
        </Group>

        <Group title={t("pages.notifications.maintenance")} icon={Wrench} tone="muted">
          {(data?.maint ?? []).map((r) => {
            const who = r.status_changed_by ? (data?.names?.[r.status_changed_by] ?? t("pages.notifications.unknownUser")) : null;
            const audit = who && r.status_changed_at
              ? t("pages.notifications.changedBy", { name: who, date: fmtDateTime(r.status_changed_at) })
              : t("pages.notifications.outOfService");
            return (
              <Item key={r.id} title={`${t("pages.notifications.room")} ${r.number}`}
                sub={`${r.property?.name ?? ""} · ${audit}`}
                badge={<Badge tone="muted">{t("pages.notifications.maintenanceBadge")}</Badge>} />
            );
          })}
          {(!data?.maint?.length) && <Empty text={t("pages.notifications.noMaintenance")} />}
        </Group>
      </div>
    </AppShell>
  );
}
