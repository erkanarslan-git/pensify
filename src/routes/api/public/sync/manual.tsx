import { createFileRoute } from "@tanstack/react-router";

// Mock manual sync trigger. Runs the placeholder queue runner.
export const Route = createFileRoute("/api/public/sync/manual")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: jobs } = await supabaseAdmin
          .from("sync_jobs")
          .select("id,attempts")
          .eq("status", "pending")
          .limit(50);
        let processed = 0;
        for (const j of jobs ?? []) {
          await supabaseAdmin
            .from("sync_jobs")
            .update({
              status: "success",
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              attempts: (j.attempts ?? 0) + 1,
              result: { mock: true },
            })
            .eq("id", j.id);
          processed++;
        }
        return Response.json({ ok: true, processed });
      },
    },
  },
});
