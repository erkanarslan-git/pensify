import { createFileRoute } from "@tanstack/react-router";
import { handleChannelWebhook } from "@/lib/channel-webhook.server";

// Airbnb placeholder. Disabled until real WuBook/provider auth exists.
export const Route = createFileRoute("/api/public/webhooks/airbnb")({
  server: {
    handlers: {
      POST: async ({ request }) => handleChannelWebhook(request, "airbnb"),
    },
  },
});
