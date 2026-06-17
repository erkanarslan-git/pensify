import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/airbnb")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown = null;
        try { body = await request.json(); } catch { /* ignore */ }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("sync_jobs").insert({
          channel: "airbnb",
          direction: "import",
          status: "pending",
          payload: { source: "webhook", body: body as any },
        });
        return Response.json({ ok: true, mock: true });
      },
    },
  },
});
