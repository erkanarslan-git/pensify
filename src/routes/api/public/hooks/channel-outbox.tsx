import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Sends pending channel-manager events (availability / rates) per organization.
 * Auth: x-cron-secret checked against private.cron_secrets ("channel-outbox").
 * Until a WuBook account is enabled for an organization, its rows stay pending.
 * In dry-run mode rows are marked "dry_run" without calling WuBook.
 */
const BATCH = 100;
const MAX_ATTEMPTS = 8;

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
          .select("id, organization_id, provider, property_code, secret_name, enabled, dry_run")
          .eq("enabled", true);

        const summary: Record<string, unknown>[] = [];
        for (const acc of accounts ?? []) {
          const { data: rows } = await supabase
            .from("integration_outbox")
            .select("id, event, payload, attempts")
            .eq("organization_id", acc.organization_id)
            .eq("provider", acc.provider)
            .in("status", ["pending", "retry"])
            .lte("next_attempt_at", new Date().toISOString())
            .order("created_at")
            .limit(BATCH);
          if (!rows?.length) continue;
          const ids = rows.map((r) => r.id);

          if (acc.dry_run) {
            await supabase.from("integration_outbox")
              .update({ status: "dry_run", sent_at: new Date().toISOString() }).in("id", ids);
            summary.push({ org: acc.organization_id, dry_run: ids.length });
            continue;
          }

          const apiKey = acc.secret_name ? process.env[acc.secret_name] : undefined;
          const error = !apiKey || !acc.property_code
            ? "WuBook credentials missing"
            : "WuBook client not enabled yet"; // real push added once credentials are provided
          for (const r of rows) {
            const attempts = r.attempts + 1;
            await supabase.from("integration_outbox").update({
              status: attempts >= MAX_ATTEMPTS ? "failed" : "retry",
              attempts,
              last_error: error,
              next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString(),
            }).eq("id", r.id);
          }
          await supabase.from("channel_accounts").update({ last_error: error }).eq("id", acc.id);
          summary.push({ org: acc.organization_id, deferred: ids.length, error });
        }
        return Response.json({ accounts: summary });
      },
    },
  },
});
