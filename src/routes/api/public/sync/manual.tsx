import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { parseICal } from "@/services/channels/ical";
import { jsonError } from "@/lib/http-security.server";
import { requireOrgPermission, OrgAuthError } from "@/lib/org-auth.server";

const COOLDOWN_MS = 60_000;

// Verifies the caller's Supabase access token server-side and checks the
// manage_integrations permission (owner always; admin by default; explicit
// user/role overrides respected). Browser-supplied roles are never trusted.
async function authorize(request: Request): Promise<{ userId: string; orgId: string; email: string | null } | Response> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return jsonError(401, "unauthorized");
  const token = auth.slice(7);
  const url = process.env["SUPABASE_URL"] || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const userClient = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return jsonError(401, "unauthorized");

  let orgId: string;
  try {
    ({ orgId } = await requireOrgPermission(userClient, "manage_integrations"));
  } catch (e) {
    return jsonError(e instanceof OrgAuthError ? e.status : 403, e instanceof OrgAuthError ? e.message : "forbidden");
  }
  return { userId, orgId, email: (data.claims.email as string | undefined) ?? null };
}

// Real iCal importer. Fetches every enabled channel_integrations row that has
// an ical_url, parses events, and upserts them into public.reservations using
// (channel, external_id) as the idempotency key. Overlaps are recorded to
// conflict_alerts instead of failing the whole run.
export const Route = createFileRoute("/api/public/sync/manual")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const who = await authorize(request);
        if (who instanceof Response) return who;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Durable cooldown (workers are stateless)
        const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
        const { count: recent } = await supabaseAdmin
          .from("audit_logs").select("id", { count: "exact", head: true })
          .eq("entity", "manual_sync").eq("organization_id", who.orgId).gte("created_at", since);
        if ((recent ?? 0) > 0) return jsonError(429, "cooldown");
        const startedAt = new Date().toISOString();

        const { data: integrations, error: intErr } = await supabaseAdmin
          .from("channel_integrations")
          .select("id,channel,property_id,room_id,ical_url,name,enabled,direction")
          .eq("organization_id", who.orgId)
          .eq("enabled", true)
          .not("ical_url", "is", null);
        if (intErr) return jsonError(500, "internal_error");

        const today = new Date().toISOString().slice(0, 10);
        let processed = 0;
        let imported = 0;
        let conflicts = 0;
        let failed = 0;

        for (const i of integrations ?? []) {
          if (!i.ical_url || !i.room_id) continue;
          processed++;

          const { data: job } = await supabaseAdmin
            .from("sync_jobs")
            .insert({
              organization_id: who.orgId,
              channel: i.channel,
              direction: "import",
              property_id: i.property_id,
              room_id: i.room_id,
              integration_id: i.id,
              status: "running",
              started_at: new Date().toISOString(),
              attempts: 1,
              payload: { source: "manual", url: i.ical_url } as any,
            })
            .select("id")
            .single();

          try {
            const res = await fetch(i.ical_url, {
              headers: { "User-Agent": "Pensify/1.0 (+channel-sync)" },
              signal: AbortSignal.timeout(20_000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            const events = parseICal(text);

            let jobImported = 0;
            let jobConflicts = 0;

            for (const ev of events) {
              if (ev.end <= today) continue; // skip fully-past events, keep ongoing
              // Clip a block that started in the past so the trigger doesn't reject it.
              const startDate = ev.start < today ? today : ev.start;
              const summary = (ev.summary ?? "").trim();
              // Airbnb iCal anonymises everything as "Airbnb (Not available)" —
              // it covers both real guest bookings and manual host blocks. Treat
              // them all as "occupied" so the calendar shows the room as booked.
              // Real guest names/emails are only available via the Airbnb API.
              const isReservedTag = /reserved|reservation/i.test(summary);
              const guestName = isReservedTag
                ? summary.replace(/^reserved:?\s*/i, "").slice(0, 120) || "Airbnb Gast"
                : "Airbnb belegt";

              const row = {
                organization_id: who.orgId,
                room_id: i.room_id,
                property_id: i.property_id,
                guest_name: guestName,
                guests_count: 1,
                check_in: startDate,
                check_out: ev.end,
                channel: i.channel,
                status: "confirmed" as any,
                revenue: 0,
                external_id: ev.uid,
                ical_uid: ev.uid,
                notes: `Airbnb • ${i.name ?? "Feed"} • ${ev.start} → ${ev.end}`,
              };

              const { error: upErr } = await supabaseAdmin
                .from("reservations")
                .upsert(row, { onConflict: "organization_id,channel,room_id,external_id" });

              if (upErr) {
                if (/overlap/i.test(upErr.message)) {
                  jobConflicts++;
                  await supabaseAdmin.from("conflict_alerts").insert({
                    organization_id: who.orgId,
                    room_id: i.room_id,
                    property_id: i.property_id,
                    incoming_channel: i.channel,
                    check_in: ev.start,
                    check_out: ev.end,
                    status: "open",
                    incoming_payload: { summary, uid: ev.uid, integration_id: i.id, error: upErr.message } as any,
                  });
                } else {
                  throw upErr;
                }
              } else {
                jobImported++;
              }
            }

            imported += jobImported;
            conflicts += jobConflicts;

            if (job?.id) {
              await supabaseAdmin.from("sync_jobs").update({
                status: "success",
                completed_at: new Date().toISOString(),
                result: { events: events.length, imported: jobImported, conflicts: jobConflicts } as any,
              }).eq("id", job.id).eq("organization_id", who.orgId);
            }
            await supabaseAdmin.from("channel_integrations").update({
              last_sync_at: new Date().toISOString(),
              last_sync_status: "success",
              last_sync_error: null,
            }).eq("id", i.id).eq("organization_id", who.orgId);
          } catch (e: any) {
            failed++;
            const msg = String(e?.message ?? e).slice(0, 500);
            if (job?.id) {
              await supabaseAdmin.from("sync_jobs").update({
                status: "failed",
                completed_at: new Date().toISOString(),
                error_message: msg,
              }).eq("id", job.id).eq("organization_id", who.orgId);
            }
            await supabaseAdmin.from("channel_integrations").update({
              last_sync_at: new Date().toISOString(),
              last_sync_status: "error",
              last_sync_error: msg,
            }).eq("id", i.id).eq("organization_id", who.orgId);
          }
        }

        await supabaseAdmin.from("audit_logs").insert({
          organization_id: who.orgId,
          actor_id: who.userId,
          actor_email: who.email,
          entity: "manual_sync",
          action: "EXECUTE",
          metadata: { organization_id: who.orgId, started_at: startedAt, finished_at: new Date().toISOString(), processed, imported, conflicts, failed },
        });
        return Response.json({ ok: true, processed, imported, conflicts, failed });
      },
    },
  },
});
