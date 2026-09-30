import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { safeEqual } from "@/lib/http-security.server";

const PUBLIC_BASE = "https://project--c3bce140-98e6-40ed-a35c-6ad0fa40d481.lovable.app";

function todayISO(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function nowHHMM(tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function renderMessage(template: string, cleanerName: string, items: { propertyName: string; roomNumber: string; link: string }[]) {
  const liste = items
    .map((it, i) => `${i + 1}. ${it.propertyName} - Oda ${it.roomNumber}\n   ${it.link}`)
    .join("\n\n");
  return template
    .replaceAll("{ad}", cleanerName)
    .replaceAll("{N}", String(items.length))
    .replaceAll("{liste}", liste);
}

export const Route = createFileRoute("/api/public/hooks/dispatch-morning")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!provided) return new Response("Unauthorized", { status: 401 });
        const url = process.env["SUPABASE_URL"] || import.meta.env.VITE_SUPABASE_URL;
        const service = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
        const supabase = createClient<Database>(url, service, { auth: { persistSession: false } });
        // Accept either the env secret (if configured) or the DB-held secret used by pg_cron.
        const envSecret = process.env["DISPATCH_CRON_SECRET"];
        let ok = !!envSecret && safeEqual(provided, envSecret);
        if (!ok) {
          const { data } = await supabase.rpc("verify_cron_secret", { _name: "dispatch", _value: provided });
          ok = data === true;
        }
        if (!ok) {
          await supabase.from("cron_executions").insert({ job: "dispatch-morning", status: "rejected", finished_at: new Date().toISOString() });
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: settingsRows } = await supabase.from("app_settings").select("key,value");
        const s: Record<string, any> = {};
        for (const r of settingsRows ?? []) s[r.key] = r.value;

        const enabled = s["dispatch.enabled"] === true;
        const tz = s["dispatch.timezone"] || "Europe/Berlin";
        const target = s["dispatch.morning_time"] || "08:00";
        const template = s["dispatch.message_template"] || "Günaydın {ad}!\n{liste}";
        const lastRun = s["dispatch.last_run_date"] || "";

        if (!enabled) return Response.json({ skipped: "disabled" });

        const today = todayISO(tz);
        const hhmm = nowHHMM(tz);

        // Run once per day at or after target time
        if (lastRun === today) return Response.json({ skipped: "already_ran_today", today });
        if (hhmm < target) return Response.json({ skipped: "before_target", now: hhmm, target });

        const { data: cleaners } = await supabase.from("cleaners").select("id, full_name").eq("active", true);
        const results: any[] = [];
        const dayStart = `${today}T00:00:00Z`;
        const dayEnd = `${today}T23:59:59Z`;

        for (const c of cleaners ?? []) {
          const { data: tasks } = await supabase
            .from("cleaning_tasks")
            .select("id, status, due_at, rooms:room_id (number), properties:property_id (name, qr_token)")
            .eq("cleaner_id", c.id)
            .in("status", ["pending", "accepted", "in_progress"])
            .gte("due_at", dayStart)
            .lte("due_at", dayEnd)
            .order("due_at", { ascending: true });
          if (!tasks || tasks.length === 0) {
            results.push({ cleanerId: c.id, skipped: "no_tasks" });
            continue;
          }
          const items = tasks.map((t: any) => ({
            propertyName: t.properties?.name ?? "—",
            roomNumber: t.rooms?.number ?? "—",
            link: t.properties?.qr_token ? `${PUBLIC_BASE}/clock/${t.properties.qr_token}` : `${PUBLIC_BASE}/me`,
          }));
          const body = renderMessage(template, c.full_name ?? "", items);
          const { error } = await supabase.from("dispatch_messages").insert({
            cleaner_id: c.id,
            scheduled_for: today,
            trigger: "auto",
            task_ids: tasks.map((t: any) => t.id),
            body,
            status: "sent",
            provider: "simulation",
          });
          results.push({ cleanerId: c.id, sent: !error, count: tasks.length, error: error?.message });
        }

        await supabase
          .from("app_settings")
          .upsert({ key: "dispatch.last_run_date", value: today, updated_at: new Date().toISOString() });

        await supabase.from("cron_executions").insert({
          job: "dispatch-morning", status: "success", detail: { today, results }, finished_at: new Date().toISOString(),
        });
        return Response.json({ today, results });
      },
    },
  },
});
