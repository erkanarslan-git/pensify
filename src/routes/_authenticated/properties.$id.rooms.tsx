import { createFileRoute } from "@tanstack/react-router";
import { PropertyRoomsView } from "@/components/property-rooms-view";

export const Route = createFileRoute("/_authenticated/properties/$id/rooms")({
  head: () => ({ meta: [
    { title: "Zimmer verwalten — Pensify" },
    { name: "description", content: "Oda tiplerini, fiziksel odaları ve fiyatları tesis bazında yönetin." },
    { property: "og:title", content: "Zimmer verwalten — Pensify" },
    { property: "og:description", content: "Oda tiplerini, fiziksel odaları ve fiyatları tesis bazında yönetin." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PropertyRoomsPage,
});

function PropertyRoomsPage() {
  const { id } = Route.useParams();
  return <PropertyRoomsView propertyId={id} />;
}
