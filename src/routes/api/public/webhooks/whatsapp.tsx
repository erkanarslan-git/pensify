import { createFileRoute } from "@tanstack/react-router";
import { verifyChallenge, receiveEvent } from "@/lib/whatsapp-webhook.server";

// Meta WhatsApp Cloud API webhook. GET: subscription handshake. POST: every
// delivery is stored in the whatsapp_webhook_events inbox before ack.
export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: ({ request }) => verifyChallenge(request),
      POST: ({ request }) => receiveEvent(request),
    },
  },
});
