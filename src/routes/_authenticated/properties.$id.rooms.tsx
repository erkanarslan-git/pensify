import { createFileRoute } from "@tanstack/react-router";
import { PropertyRoomsView } from "@/components/property-rooms-view";

export const Route = createFileRoute("/_authenticated/properties/$id/rooms")({
  head: () => ({ meta: [{ title: "Zimmer verwalten — Pensify" }] }),
  component: PropertyRoomsPage,
});

function PropertyRoomsPage() {
  const { id } = Route.useParams();
  return <PropertyRoomsView propertyId={id} />;
}
