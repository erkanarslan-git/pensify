import { createFileRoute } from "@tanstack/react-router";
import { businessDate } from "@/lib/business-time";
import { isMorningDigestTime, morningDigestBody } from "@/lib/morning-digest";

export const Route = createFileRoute("/api/public/hooks/morning-tasks")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = request.headers.get("x-cron-secret");
    if (!secret) return new Response("Unauthorized", { status: 401 });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const verified = await db.rpc("verify_cron_secret", { _name: "dispatch", _value: secret });
    if (verified.error || verified.data !== true) return new Response("Unauthorized", { status: 401 });
    const now = new Date();
    if (!isMorningDigestTime(now)) return Response.json({ skipped: "outside_morning" });
    if (!process.env.LOVABLE_API_KEY || !process.env.FIREBASE_MESSAGING_API_KEY) return new Response("Push not configured", { status: 503 });
    const day = businessDate(now);
    const { data: counts, error } = await db.rpc("morning_task_counts", { _day: day });
    if (error) return new Response("Task summary unavailable", { status: 503 });
    const { sendDevicePush } = await import("@/lib/push-send.server");
    let sent = 0;
    let failed = 0;
    for (const item of counts ?? []) {
      const devices = await db.from("push_tokens").select("id,token,locale").eq("organization_id", item.organization_id).eq("user_id", item.user_id);
      if (devices.error || !devices.data?.length) continue;
      const claim = await db.rpc("claim_morning_push", { _org: item.organization_id, _user: item.user_id, _day: day });
      if (claim.error || !claim.data) continue;
      let delivered = 0;
      let errors = 0;
      for (const device of devices.data) {
        const body = morningDigestBody(item.today_count, item.overdue_count, device.locale);
        if (!body) continue;
        try {
          const result = await sendDevicePush(device.token, body, "/action-center", `morning-${item.organization_id}-${day}`);
          if (result === "sent") delivered++;
          else if (result === "stale") await db.from("push_tokens").delete().eq("id", device.id).eq("organization_id", item.organization_id);
          else errors++;
        } catch { errors++; }
      }
      await db.from("morning_push_deliveries").update({ status: errors ? "error" : delivered ? "sent" : "no_devices", sent_count: delivered, finished_at: new Date().toISOString() }).eq("organization_id", item.organization_id).eq("user_id", item.user_id).eq("day", day);
      sent += delivered;
      failed += errors;
    }
    return Response.json({ sent, failed });
  } } },
});