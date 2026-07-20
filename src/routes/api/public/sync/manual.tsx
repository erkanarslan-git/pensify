import { createFileRoute } from "@tanstack/react-router";
import { parseICal } from "@/services/channels/ical";

// Real iCal importer. Fetches every enabled channel_integrations row that has
// an ical_url, parses events, and upserts them into public.reservations using
// (channel, external_id) as the idempotency key. Overlaps are recorded to
// conflict_alerts instead of failing the whole run.
export const Route = createFileRoute("/api/public/sync/manual")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: integrations, error: intErr } = await supabaseAdmin
          .from("channel_integrations")
          .select("id,channel,property_id,room_id,ical_url,name,enabled,direction")
          .eq("enabled", true)
          .not("ical_url", "is", null);
        if (intErr) return Response.json({ ok: false, error: intErr.message }, { status: 500 });

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
              if (ev.end <= today) continue; // skip past
              const summary = (ev.summary ?? "").trim();
              // Skip Airbnb "Not available" placeholder blocks — they represent
              // internal blocks with no real booking. Keep confirmed reservations.
              const isBlock = /not available/i.test(summary);
              const guestName = isBlock
                ? "Airbnb Blockierung"
                : summary.replace(/^reserved:?\s*/i, "").slice(0, 120) || "Airbnb Buchung";

              const row = {
                room_id: i.room_id,
                property_id: i.property_id,
                guest_name: guestName,
                guests_count: 1,
                check_in: ev.start,
                check_out: ev.end,
                channel: i.channel,
                status: (isBlock ? "tentative" : "confirmed") as any,
                revenue: 0,
                external_id: ev.uid,
                ical_uid: ev.uid,
                notes: `Auto-imported from ${i.name ?? i.channel} on ${new Date().toISOString().slice(0, 10)}`,
              };

              const { error: upErr } = await supabaseAdmin
                .from("reservations")
                .upsert(row, { onConflict: "channel,external_id" });

              if (upErr) {
                if (/overlap/i.test(upErr.message)) {
                  jobConflicts++;
                  await supabaseAdmin.from("conflict_alerts").insert({
                    room_id: i.room_id,
                    property_id: i.property_id,
                    incoming_channel: i.channel,
                    incoming_external_id: ev.uid,
                    check_in: ev.start,
                    check_out: ev.end,
                    status: "open",
                    details: { summary, integration_id: i.id, error: upErr.message } as any,
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
              }).eq("id", job.id);
            }
            await supabaseAdmin.from("channel_integrations").update({
              last_sync_at: new Date().toISOString(),
              last_sync_status: "success",
              last_sync_error: null,
            }).eq("id", i.id);
          } catch (e: any) {
            failed++;
            const msg = String(e?.message ?? e).slice(0, 500);
            if (job?.id) {
              await supabaseAdmin.from("sync_jobs").update({
                status: "failed",
                completed_at: new Date().toISOString(),
                error_message: msg,
              }).eq("id", job.id);
            }
            await supabaseAdmin.from("channel_integrations").update({
              last_sync_at: new Date().toISOString(),
              last_sync_status: "error",
              last_sync_error: msg,
            }).eq("id", i.id);
          }
        }

        return Response.json({ ok: true, processed, imported, conflicts, failed });
      },
    },
  },
});
