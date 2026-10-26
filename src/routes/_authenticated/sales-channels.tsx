import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/app-shell";
import { RoomSalesChannels } from "@/components/room-sales-channels";

export const Route = createFileRoute("/_authenticated/sales-channels")({
  head: () => ({ meta: [
    { title: "Vertriebskanäle — Pensify" },
    { name: "description", content: "Welche Zimmer bei Booking.com, Airbnb, Expedia und auf der Webseite verkauft werden." },
    { property: "og:title", content: "Vertriebskanäle — Pensify" },
    { property: "og:description", content: "Welche Zimmer bei Booking.com, Airbnb, Expedia und auf der Webseite verkauft werden." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SalesChannelsPage,
});

function SalesChannelsPage() {
  const { t } = useTranslation();
  return (
    <AppShell title={t("salesChannels.title")} subtitle={t("salesChannels.subtitle")}>
      <RoomSalesChannels />
    </AppShell>
  );
}
