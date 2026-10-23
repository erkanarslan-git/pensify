import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bankConnectionState, channelConnectionState } from "./integration-status";
export const getIntegrationOverview = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { resolveActiveOrg } = await import("./org-auth.server");
  const { orgId, role } = await resolveActiveOrg(context.supabase);
  const channelsAllowed = role === "owner" || role === "admin";
  const { data: bankAllowed, error: permissionError } = await context.supabase.rpc("has_organization_permission", { _org: orgId, _permission: "manage_bank" });
  if (permissionError) throw new Error("permission_unavailable");
  let channels = null;
  if (channelsAllowed) {
    const configured = Boolean(process.env["WUBOOK_WIRED_URL"] && process.env["WUBOOK_WIRED_TOKEN"] && process.env["WUBOOK_CORPORATE_CODE"]);
    const [accounts, mappings] = await Promise.all([
      context.supabase.from("channel_accounts").select("id,last_pull_at,last_push_at,last_error").eq("organization_id", orgId).eq("provider", "wubook").eq("is_test", false),
      context.supabase.from("channel_property_mappings").select("id").eq("organization_id", orgId).eq("enabled", true),
    ]);
    if (accounts.error || mappings.error) throw new Error("integration_unavailable");
    const mapped = Boolean(mappings.data?.length);
    channels = { state: channelConnectionState(configured, mapped, Boolean(accounts.data?.some((a) => [a.last_pull_at, a.last_push_at].some(value => value && Date.parse(value) > Date.now() - 86400000))), Boolean(accounts.data?.some((a) => a.last_error))), configurationMissing: !configured, accountMissing: !accounts.data?.length, mappingMissing: !mapped };
  }
  const bank = bankAllowed === true ? { state: bankConnectionState(false), providerMissing: true } : null;
  return { channels, bank };
});