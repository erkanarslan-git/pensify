import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildICal } from "@/services/channels/ical";

export const Route = createFileRoute("/api/public/ical/rooms/$roomId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return new Response("Missing token", { status: 401 });

        const sb = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: room } = await sb
          .from("rooms")
          .select("id,number,ical_feed_token")
          .eq("id", params.roomId)
          .maybeSingle();
        if (!room || room.ical_feed_token !== token) {
          return new Response("Forbidden", { status: 403 });
        }

        const { data: res } = await sb
          .from("reservations")
          .select("id,ical_uid,check_in,check_out,guest_name,channel,status")
          .eq("room_id", params.roomId)
          .neq("status", "cancelled");

        const ics = buildICal({
          calName: `Room ${room.number}`,
          events: (res ?? []).map((r) => ({
            uid: r.ical_uid || `${r.id}@pensify`,
            start: r.check_in,
            end: r.check_out,
            summary: `Reserved (${r.channel})`,
          })),
        });

        return new Response(ics, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
