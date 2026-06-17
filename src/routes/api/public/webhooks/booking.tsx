import { createFileRoute } from "@tanstack/react-router";

// Placeholder Booking.com webhook receiver. Real implementation MUST verify
// the provider signature before trusting the payload.
export const Route = createFileRoute("/api/public/webhooks/booking")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown = null;
        try { body = await request.json(); } catch { /* ignore */ }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("sync_jobs").insert({
          channel: "booking",
          direction: "import",
          status: "pending",
          payload: { source: "webhook", body: body as any },
        });
        return Response.json({ ok: true, mock: true });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
