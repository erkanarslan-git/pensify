import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { OpenIssuesList } from "@/components/room-issues";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/maintenance")({
  head: () => ({ meta: [
    { title: "Wartungsarbeiten — Pension Highway" },
    { name: "description", content: "Offene Wartungsarbeiten und berechtigte Mitarbeiterzuweisung in Pension Highway." },
    { property: "og:title", content: "Wartungsarbeiten — Pension Highway" },
    { property: "og:description", content: "Wartungsarbeiten und verantwortliche Mitarbeiter verwalten." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MaintenancePage,
});
function MaintenancePage() {
  const { t } = useTranslation();
  const permissions = usePermissions();
  return <AppShell title={t("departments.maintenance")}>
    <OpenIssuesList showEmpty canResolve={permissions.can("manage_rooms") || permissions.can("assign_cleaning")} roomLabel={() => "—"} />
  </AppShell>;
}