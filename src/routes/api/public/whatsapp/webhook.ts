import { createFileRoute } from "@tanstack/react-router";
import { verifyChallenge, receiveEvent } from "@/lib/whatsapp-webhook.server";

// Connector-contract webhook path (same handler as /api/public/webhooks/whatsapp).
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: ({ request }) => verifyChallenge(request),
      POST: ({ request }) => receiveEvent(request),
    },
  },
});
