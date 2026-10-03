import { createFileRoute } from "@tanstack/react-router";
import { handleWuBookWebhook } from "@/lib/wubook/webhook.server";

export const Route = createFileRoute("/api/public/webhooks/wubook/$secret")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handleWuBookWebhook(request, params.secret),
    },
  },
});
