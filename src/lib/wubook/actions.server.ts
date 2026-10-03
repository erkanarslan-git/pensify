// WuBook Wired actions for the test property + webhook. Server-only.
// Never log or return the token, the account password or the webhook secret.
import { callXmlRpc, XmlRpcError } from "./xmlrpc.server";
import { assertMethodAllowed, getWuBookConfig, WuBookGuardError, type WuBookConfig } from "./service.server";

export const WUBOOK_TEST_LCODE = "1000";
export const WUBOOK_TEST_RCODE = "2000";
const DEFAULT_PUBLIC_BASE = "https://pensify.lovable.app";

export type WiredResult<T> = { ok: true; data: T } | { ok: false; errorCode: string; errorMessage: string };

function requireConfig(): WuBookConfig {
  const { config } = getWuBookConfig();
  if (!config) throw new WuBookActionError("missing_config", "WuBook ist nicht konfiguriert.");
  return config;
}

export class WuBookActionError extends Error {
  constructor(public code: string, public userMessage: string) {
    super(code);
  }
}

/** Calls a Wired method through the guard and parses [status, payload]. */
async function wired(method: string, args: unknown[], opts: { adminAction?: boolean } = {}, fetchImpl?: typeof fetch) {
  const config = requireConfig();
  assertMethodAllowed(method, config, opts);
  const raw = await callXmlRpc(method, [config.token, ...args], { url: config.url, fetchImpl });
  if (!Array.isArray(raw) || raw.length === 0) throw new WuBookActionError("unexpected_response", "Unerwartete Antwort von WuBook.");
  const [status, payload] = raw as [unknown, unknown];
  if (status !== 0) {
    const msg = typeof payload === "string" ? sanitize(payload).slice(0, 200) : "WuBook-Fehler";
    throw new WuBookActionError(`wubook_error_${String(status)}`, msg);
  }
  return payload;
}

/** Strips anything that could contain a secret from provider messages. */
export function sanitize(text: string): string {
  const secrets = [process.env["WUBOOK_WIRED_TOKEN"], process.env["WUBOOK_WEBHOOK_SECRET"]].filter(
    (s): s is string => !!s && s.length > 3,
  );
  let out = text;
  for (const s of secrets) out = out.split(s).join("[REDACTED]");
  return out;
}

export async function run<T>(fn: () => Promise<T>): Promise<WiredResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof WuBookActionError) return { ok: false, errorCode: e.code, errorMessage: e.userMessage };
    if (e instanceof WuBookGuardError) return { ok: false, errorCode: "method_blocked", errorMessage: "Methode ist gesperrt." };
    if (e instanceof XmlRpcError) return { ok: false, errorCode: e.message, errorMessage: "WuBook nicht erreichbar oder ungültige Antwort." };
    return { ok: false, errorCode: "unexpected_error", errorMessage: "Unerwarteter Fehler." };
  }
}

// ---------- Webhook URL ----------
export function webhookUrl(): string {
  const secret = process.env["WUBOOK_WEBHOOK_SECRET"];
  if (!secret) throw new WuBookActionError("missing_webhook_secret", "Webhook-Schlüssel fehlt.");
  const base = (process.env["WUBOOK_WEBHOOK_BASE_URL"] ?? DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
  return `${base}/api/public/webhooks/wubook/${secret}`;
}

export function maskWebhookUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/(\/webhooks\/wubook\/)([^/?#]+)/, (_, p, s: string) => `${p}${s.slice(0, 4)}••••••`);
}

// ---------- Test property ----------
export interface TestPropertyInput {
  name: string;
  address: string;
  zip: string;
  city: string;
  phone: string;
  contact_email: string;
  booking_email: string;
  first_name: string;
  last_name: string;
  email: string;
  account_phone: string;
}

export function buildNewPropertyArgs(i: TestPropertyInput) {
  // Fields per WuBook docs: url is required; the official XML example also sends `email`.
  const lodg = {
    name: i.name,
    address: i.address,
    url: DEFAULT_PUBLIC_BASE,
    zip: i.zip,
    city: i.city,
    phone: i.phone,
    email: i.contact_email,
    contact_email: i.contact_email,
    booking_email: i.booking_email,
    country: "DE",
    timezone: "Europe/Berlin",
  };
  const account = {
    first_name: i.first_name,
    last_name: i.last_name,
    email: i.email,
    phone: i.account_phone,
    lang: "de",
    currency: "EUR",
  };
  // woodoo_only is deprecated by WuBook: it must be 0. No OTA channels are
  // connected automatically either way (channels are linked manually in WuBook).
  return [lodg, 0, account] as const;
}

export async function createTestProperty(i: TestPropertyInput, fetchImpl?: typeof fetch) {
  const payload = await wired("corporate_new_account_and_property", [...buildNewPropertyArgs(i)], { adminAction: true }, fetchImpl);
  const p = (payload ?? {}) as Record<string, unknown>;
  const acode = p["acode"] != null ? String(p["acode"]) : null;
  const lcode = p["lcode"] != null ? String(p["lcode"]) : null;
  const password = p["password"] != null ? String(p["password"]) : null;
  if (!lcode) throw new WuBookActionError("missing_lcode", "WuBook hat keinen Property-Code geliefert.");
  return { acode, lcode, password };
}

export async function activatePushTest(lcode: string, fetchImpl?: typeof fetch) {
  await wired("push_activation", [lcode, webhookUrl(), 1], { adminAction: true }, fetchImpl);
  return true;
}

export async function readPushUrl(lcode: string, fetchImpl?: typeof fetch) {
  const payload = await wired("push_url", [lcode], {}, fetchImpl);
  return typeof payload === "string" && payload.length > 0 ? payload : null;
}

/** Read-only: mark is ALWAYS 0, so WuBook keeps the bookings as "new". */
export async function fetchNewBookingsReadOnly(lcode: string, fetchImpl?: typeof fetch) {
  const payload = await wired("fetch_new_bookings", [lcode, 1, 0], {}, fetchImpl);
  return Array.isArray(payload) ? payload.length : 0;
}

export function isImportEnabled(): boolean {
  return process.env["WUBOOK_RESERVATION_IMPORT_ENABLED"] === "true";
}
