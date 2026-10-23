import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Section } from "@/components/app-shell";
import { usePermissions } from "@/hooks/use-permissions";
import { ReservationTrash } from "@/components/reservation-trash";

export const Route = createFileRoute("/_authenticated/settings/trash")({
  head: () => ({ meta: [{ title: "Çöp kutusu — Pensify" }, { name: "description", content: "Silinen rezervasyonları geri alın veya kalıcı silin." }, { property: "og:title", content: "Çöp kutusu — Pensify" }, { property: "og:description", content: "Silinen rezervasyonları geri alın veya kalıcı silin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TrashPage,
});

function TrashPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const queryClient = useQueryClient();

  if (perms.loading) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (!perms.isAdmin) return <div className="rounded-xl border border-border bg-card p-4 text-sm">{t("resv.noPermission")}</div>;

  return (
    <Section title={t("resv.periodTrash")}>
      <ReservationTrash onChanged={() => queryClient.invalidateQueries({ queryKey: ["reservations-list"] })} />
    </Section>
  );
}
