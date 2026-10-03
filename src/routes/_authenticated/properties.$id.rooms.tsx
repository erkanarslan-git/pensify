import { createFileRoute } from "@tanstack/react-router";
import { RoomsManager } from "./rooms";

export const Route = createFileRoute("/_authenticated/properties/$id/rooms")({
  head: () => ({ meta: [{ title: "Zimmer verwalten — Pensify" }] }),
  component: PropertyRoomsPage,
});

function PropertyRoomsPage() {
  const { id } = Route.useParams();
  return <RoomsManager propertyId={id} />;
}
