import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { handleWuBookWebhook, type InboxStore } from "./webhook.server";
import { fetchNewBookingsReadOnly, activatePushTest, maskWebhookUrl, sanitize } from "./actions.server";
import { assertMethodAllowed, getWuBookConfig, WuBookGuardError } from "./service.server";

const SECRET = "whsecret_abcdefghijklmnopqrstuvwxyz";

beforeEach(() => {
  process.env.WUBOOK_WIRED_URL = "https://wired.wubook.net/xrws/";
  process.env.WUBOOK_WIRED_TOKEN = "tok-secret-999";
  process.env.WUBOOK_CORPORATE_CODE = "EA217";
  process.env.WUBOOK_MODE = "shadow";
  process.env.WUBOOK_OUTBOUND_ENABLED = "false";
  process.env.WUBOOK_WEBHOOK_SECRET = SECRET;
  delete process.env.WUBOOK_RESERVATION_IMPORT_ENABLED;
});

function memStore(accountsByLcode: Record<string, Array<{ id: string; organization_id: string }>> = {}) {
  const rows: any[] = [];
  const store: InboxStore = {
    findTestAccountsStartedSince: async () => [{ id: "acc1", organization_id: "org1" }],
    findAccountsByLcode: async (l) => accountsByLcode[l] ?? [],
    insertInbox: async (r) => {
      if (!rows.some((x) => x.organization_id === r.organization_id && x.lcode === r.lcode && x.rcode === r.rcode && x.event_type === r.event_type)) rows.push(r);
    },
    markTestReceived: async () => {},
  };
  return { store, rows };
}
const post = (body: string) =>
  new Request("https://x/api/public/webhooks/wubook/s", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });

describe("wubook webhook", () => {
  it("test POST returns 200 and creates no booking", async () => {
    const { store, rows } = memStore();
    const r = await handleWuBookWebhook(post("lcode=1000&rcode=2000"), SECRET, store);
    expect(r.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe("test");
    expect(rows[0].status).toBe("test_received");
  });
  it("duplicate test notification creates no duplicate inbox", async () => {
    const { store, rows } = memStore();
    await handleWuBookWebhook(post("lcode=1000&rcode=2000"), SECRET, store);
    await handleWuBookWebhook(post("lcode=1000&rcode=2000"), SECRET, store);
    expect(rows).toHaveLength(1);
  });
  it("unknown lcode is not recorded", async () => {
    const { store, rows } = memStore();
    const r = await handleWuBookWebhook(post("lcode=555&rcode=1"), SECRET, store);
    expect(r.status).toBe(200);
    expect(rows).toHaveLength(0);
  });
  it("real notification stays received_not_processed while flag is off", async () => {
    const { store, rows } = memStore({ "777": [{ id: "a", organization_id: "o" }] });
    await handleWuBookWebhook(post("lcode=777&rcode=42"), SECRET, store);
    expect(rows[0].status).toBe("received_not_processed");
  });
  it("wrong secret returns 404", async () => {
    const { store } = memStore();
    const r = await handleWuBookWebhook(post("lcode=1000&rcode=2000"), "nope", store);
    expect(r.status).toBe(404);
  });
});

describe("wubook actions safety", () => {
  it("fetch_new_bookings sends mark=0", async () => {
    let body = "";
    const f = vi.fn(async (_u: any, init: any) => {
      body = init.body;
      return new Response(`<?xml version="1.0"?><methodResponse><params><param><value><array><data><value><int>0</int></value><value><array><data></data></array></value></data></array></value></param></params></methodResponse>`);
    });
    const n = await fetchNewBookingsReadOnly("123", f as any);
    expect(n).toBe(0);
    expect(body).toContain("<methodName>fetch_new_bookings</methodName>");
    expect(body.endsWith("<param><value><int>1</int></value></param><param><value><int>0</int></value></param></params></methodCall>")).toBe(true);
  });
  it("mark_bookings is always blocked", () => {
    const { config } = getWuBookConfig();
    expect(() => assertMethodAllowed("mark_bookings", config!, { adminAction: true })).toThrow(WuBookGuardError);
  });
  it("push_activation requires adminAction", () => {
    const { config } = getWuBookConfig();
    expect(() => assertMethodAllowed("push_activation", config!)).toThrow(WuBookGuardError);
    expect(() => assertMethodAllowed("push_activation", config!, { adminAction: true })).not.toThrow();
  });
  it("secrets are masked/redacted", async () => {
    expect(maskWebhookUrl(`https://a/api/public/webhooks/wubook/${SECRET}`)).not.toContain(SECRET);
    expect(sanitize(`bad tok-secret-999 ${SECRET}`)).toBe("bad [REDACTED] [REDACTED]");
    const f = vi.fn(async () => new Response(`<?xml version="1.0"?><methodResponse><params><param><value><array><data><value><int>-1</int></value><value><string>bad tok-secret-999</string></value></data></array></value></param></params></methodResponse>`));
    await expect(activatePushTest("1", f as any)).rejects.toMatchObject({ userMessage: "bad [REDACTED]" });
  });
  it("mark_bookings is never called in source", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const offenders = walk("src").filter((p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts")).filter((p) => /["'`]mark_bookings["'`]\s*[,\])]/.test(readFileSync(p, "utf8")) && !p.endsWith("service.server.ts"));
    expect(offenders).toEqual([]);
  });
});
