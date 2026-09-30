import { createFileRoute } from "@tanstack/react-router";
import { handleChannelWebhook } from "@/lib/channel-webhook.server";

// Booking.com placeholder. Disabled until real WuBook/provider auth exists.
export const Route = createFileRoute("/api/public/webhooks/booking")({
  server: {
    handlers: {
      POST: async ({ request }) => handleChannelWebhook(request, "booking"),
    },
  },
});
