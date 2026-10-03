// Read-only WuBook Wired service. Server-only.
// Shadow mode: only explicitly allowlisted read methods may run. Any other
// method is rejected here, before the transport, regardless of caller.

import { callXmlRpc, XmlRpcError, type XmlRpcTransportOptions } from "./xmlrpc.server";

const READ_ONLY_METHODS = new Set(["corporate_fetch_accounts", "get_channels_info"]);

export class WuBookGuardError extends Error {
  constructor(public method: string) {
    super("method_not_allowed_in_shadow_mode");
  }
}

export interface WuBookConfig {
  url: string;
  token: string;
  corporateCode: string;
  mode: string;
  outboundEnabled: boolean;
}

/** Read config from env inside the handler (never at module scope). */
export function getWuBookConfig(): { config?: WuBookConfig; missing: string[] } {
  const url = process.env["WUBOOK_WIRED_URL"];
  const token = process.env["WUBOOK_WIRED_TOKEN"];
  const corporateCode = process.env["WUBOOK_CORPORATE_CODE"];
  const missing: string[] = [];
  if (!url) missing.push("WUBOOK_WIRED_URL");
  if (!token) missing.push("WUBOOK_WIRED_TOKEN");
  if (!corporateCode) missing.push("WUBOOK_CORPORATE_CODE");
  if (missing.length) return { missing };
  return {
    missing,
    config: {
      url: url!,
      token: token!,
      corporateCode: corporateCode!,
      mode: process.env["WUBOOK_MODE"] ?? "shadow",
      outboundEnabled: process.env["WUBOOK_OUTBOUND_ENABLED"] === "true",
    },
  };
}

/** Server-side mutation guard: rejects anything outside the read allowlist
 *  while shadow mode is on or outbound is disabled. */
export function assertMethodAllowed(method: string, config: WuBookConfig): void {
  if (READ_ONLY_METHODS.has(method)) return;
  if (config.mode === "shadow" || !config.outboundEnabled) {
    throw new WuBookGuardError(method);
  }
  // Even outside shadow mode, methods must be explicitly allowlisted by a
  // future phase before they can be called.
  throw new WuBookGuardError(method);
}

export interface ConnectionTestResult {
  connected: boolean;
  mode: string;
  outboundEnabled: boolean;
  corporateCode: string;
  subaccounts: number | null;
  properties: number | null;
  testedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
}

/** WuBook Wired standard response: [statusCode, resultOrErrorMessage]. */
function parseWiredStatus(raw: unknown): { ok: boolean; result: unknown; errorCode: string | null } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, result: null, errorCode: "unexpected_response" };
  const [status, payload] = raw as [unknown, unknown];
  if (status === 0) return { ok: true, result: payload, errorCode: null };
  return { ok: false, result: null, errorCode: `wubook_error_${String(status)}` };
}

export async function testConnection(
  fetchImpl?: typeof fetch,
  transportOverrides?: Partial<XmlRpcTransportOptions>,
): Promise<ConnectionTestResult> {
  const testedAt = new Date().toISOString();
  const { config, missing } = getWuBookConfig();
  const base: ConnectionTestResult = {
    connected: false,
    mode: config?.mode ?? "shadow",
    outboundEnabled: config?.outboundEnabled ?? false,
    corporateCode: config?.corporateCode ?? "",
    subaccounts: null,
    properties: null,
    testedAt,
    errorCode: null,
    errorMessage: null,
  };
  if (!config) {
    return { ...base, errorCode: "missing_config", errorMessage: `Missing: ${missing.join(", ")}` };
  }

  try {
    assertMethodAllowed("corporate_fetch_accounts", config);
    const transport: XmlRpcTransportOptions = { url: config.url, fetchImpl, ...transportOverrides };
    // corporate_fetch_accounts(token) — token never leaves the server.
    const raw = await callXmlRpc("corporate_fetch_accounts", [config.token], transport);
    const { ok, result, errorCode } = parseWiredStatus(raw);
    if (!ok) {
      return { ...base, errorCode: errorCode ?? "wubook_error", errorMessage: "WuBook rejected the request (check token/corporate code)." };
    }
    const accounts = Array.isArray(result) ? result : [];
    // Count properties across subaccounts if the structure exposes them.
    let properties = 0;
    let propertiesKnown = false;
    for (const acc of accounts) {
      const props = (acc as Record<string, unknown>)?.["properties"];
      if (Array.isArray(props)) {
        properties += props.length;
        propertiesKnown = true;
      }
    }
    return {
      ...base,
      connected: true,
      subaccounts: accounts.length,
      properties: propertiesKnown ? properties : null,
    };
  } catch (e) {
    if (e instanceof WuBookGuardError) {
      return { ...base, errorCode: "method_blocked", errorMessage: "Method not allowed in shadow mode." };
    }
    if (e instanceof XmlRpcError) {
      const messages: Record<XmlRpcError["code"], string> = {
        timeout: "Connection timed out.",
        http: "Could not reach WuBook.",
        malformed: "Invalid response from WuBook.",
        too_large: "Response too large.",
        fault: "WuBook returned an error.",
      };
      return { ...base, errorCode: e.message, errorMessage: messages[e.code] };
    }
    return { ...base, errorCode: "unexpected_error", errorMessage: "Unexpected error." };
  }
}
