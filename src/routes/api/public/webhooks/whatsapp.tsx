import { createFileRoute } from "@tanstack/react-router";

// Meta WhatsApp Cloud API webhook verification.
// Incoming events are acknowledged only; processing is added after the account is connected.
const DEFAULT_VERIFY_TOKEN = "pensify_wa_2026";

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env.WHATSAPP_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN;
        if (mode === "subscribe" && token === expected && /^[\w-]{1,200}$/.test(challenge)) {
          return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async () => new Response("ok", { status: 200 }),
    },
  },
});
