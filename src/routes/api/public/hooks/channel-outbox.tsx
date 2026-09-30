import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Sends pending channel-manager events per WuBook account and property connection.
 * Auth: x-cron-secret checked against private.cron_secrets ("channel-outbox").
 * One account (credentials) per organization; many channel_property_mappings, each linking a
 * Pensify property to its WuBook property code. Property-scoped events go to that mapping only;
 * org-wide events (rates) fan out to every enabled mapping.
 * LIVE_CALLS_ENABLED is false: every row is marked "dry_run" and WuBook is never contacted.
 */
const BATCH = 100;
const LIVE_CALLS_ENABLED = false;

export const Route = createFileRoute("/api/public/hooks/channel-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!provided) return new Response("Unauthorized", { status: 401 });
        const url = process.env["SUPABASE_URL"] || import.meta.env.VITE_SUPABASE_URL;
        const supabase = createClient<Database>(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
          auth: { persistSession: false },
        });
        const { data: ok } = await supabase.rpc("verify_cron_secret", { _name: "channel-outbox", _value: provided });
        if (ok !== true) return new Response("Unauthorized", { status: 401 });

        const { data: accounts } = await supabase
          .from("channel_accounts")
          .select("id, organization_id, provider, enabled, dry_run")
          .eq("provider", "wubook")
          .eq("enabled", true);

        const summary: Record<string, unknown>[] = [];
        for (const acc of accounts ?? []) {
          const { data: mappings } = await supabase
            .from("channel_property_mappings")
            .select("id, property_id, external_property_code")
            .eq("account_id", acc.id)
            .eq("enabled", true);
          if (!mappings?.length) continue;
          const mapped = new Set(mappings.map((m) => m.property_id));

          const { data: rows } = await supabase
            .from("integration_outbox")
            .select("id, event, payload, property_id")
            .eq("organization_id", acc.organization_id)
            .eq("provider", "wubook")
            .in("status", ["pending", "retry"])
            .lte("next_attempt_at", new Date().toISOString())
            .order("created_at")
            .limit(BATCH);
          // property-scoped rows for unmapped properties stay pending until that property is connected
          const due = (rows ?? []).filter((r) => !r.property_id || mapped.has(r.property_id));
          if (!due.length) continue;

          if (!LIVE_CALLS_ENABLED || acc.dry_run) {
            await supabase.from("integration_outbox")
              .update({ status: "dry_run", sent_at: new Date().toISOString() })
              .in("id", due.map((r) => r.id));
            summary.push({ org: acc.organization_id, properties: mappings.length, dry_run: due.length });
            continue;
          }
          // Real WuBook push is intentionally not implemented until credentials are provided.
        }
        return Response.json({ live: LIVE_CALLS_ENABLED, accounts: summary });
      },
    },
  },
});
