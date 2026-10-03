import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRequest, parseResponse, callXmlRpc, XmlRpcError } from "./xmlrpc.server";
import { assertMethodAllowed, getWuBookConfig, testConnection, WuBookGuardError } from "./service.server";

const ENV_KEYS = ["WUBOOK_WIRED_URL", "WUBOOK_WIRED_TOKEN", "WUBOOK_CORPORATE_CODE", "WUBOOK_MODE", "WUBOOK_OUTBOUND_ENABLED"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.WUBOOK_WIRED_URL = "https://wired.wubook.net/xrws/";
  process.env.WUBOOK_WIRED_TOKEN = "test-token-123";
  process.env.WUBOOK_CORPORATE_CODE = "EA217";
  process.env.WUBOOK_MODE = "shadow";
  process.env.WUBOOK_OUTBOUND_ENABLED = "false";
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/xml" } });
}

const OK_XML = (inner: string) =>
  `<?xml version="1.0"?><methodResponse><params><param><value>${inner}</value></param></params></methodResponse>`;

describe("xmlrpc transport", () => {
  it("escapes params in the request body", () => {
    const xml = buildRequest("corporate_fetch_accounts", ['tok<&>"']);
    expect(xml).toContain("tok&lt;&amp;&gt;&quot;");
    expect(xml).not.toContain('tok<&>"');
  });

  it("parses a Wired-style [0, result] array response", () => {
    const xml = OK_XML(
      "<array><data><value><int>0</int></value><value><array><data><value><struct><member><name>name</name><value><string>Hotel A</string></value></member></struct></value></data></array></value></data></array>",
    );
    const parsed = parseResponse(xml) as [number, Array<{ name: string }>];
    expect(parsed[0]).toBe(0);
    expect(parsed[1][0].name).toBe("Hotel A");
  });

  it("rejects XML with DTD / entities (XXE)", () => {
    expect(() =>
      parseResponse(`<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><methodResponse><params><param><value>&x;</value></param></params></methodResponse>`),
    ).toThrow(XmlRpcError);
  });

  it("throws on XML-RPC fault", () => {
    expect(() =>
      parseResponse(`<?xml version="1.0"?><methodResponse><fault><value><struct><member><name>faultCode</name><value><int>2</int></value></member><member><name>faultString</name><value><string>bad</string></value></member></struct></value></fault></methodResponse>`),
    ).toThrow(/xmlrpc_fault_2/);
  });

  it("times out via AbortError", async () => {
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    ) as unknown as typeof fetch;
    await expect(callXmlRpc("m", [], { url: "https://x", fetchImpl, timeoutMs: 5 })).rejects.toThrow("request_timeout");
  });

  it("rejects oversized responses", async () => {
    const fetchImpl = vi.fn(async () =>
      xmlResponse(OK_XML("<string>ok</string>"), 200),
    ) as unknown as typeof fetch;
    await expect(callXmlRpc("m", [], { url: "https://x", fetchImpl, maxBytes: 10 })).rejects.toThrow("response_too_large");
  });
});

describe("shadow-mode mutation guard", () => {
  it("allows read-only allowlisted methods", () => {
    const { config } = getWuBookConfig();
    expect(() => assertMethodAllowed("corporate_fetch_accounts", config!)).not.toThrow();
    expect(() => assertMethodAllowed("get_channels_info", config!)).not.toThrow();
  });

  it("blocks mutations in shadow mode", () => {
    const { config } = getWuBookConfig();
    for (const m of ["update_availability", "push_update_prices", "new_reservation", "cancel_reservation"]) {
      expect(() => assertMethodAllowed(m, config!)).toThrow(WuBookGuardError);
    }
  });

  it("blocks mutations when OUTBOUND_ENABLED=false even outside shadow", () => {
    process.env.WUBOOK_MODE = "live";
    process.env.WUBOOK_OUTBOUND_ENABLED = "false";
    const { config } = getWuBookConfig();
    expect(() => assertMethodAllowed("update_availability", config!)).toThrow(WuBookGuardError);
  });
});

describe("testConnection", () => {
  it("reports missing config when the token is absent", async () => {
    delete process.env.WUBOOK_WIRED_TOKEN;
    const res = await testConnection();
    expect(res.connected).toBe(false);
    expect(res.errorCode).toBe("missing_config");
    expect(res.errorMessage).toContain("WUBOOK_WIRED_TOKEN");
    expect(res.errorMessage).not.toContain("test-token-123");
  });

  it("returns sanitized success with subaccount count", async () => {
    const fetchImpl = vi.fn(async () =>
      xmlResponse(OK_XML("<array><data><value><int>0</int></value><value><array><data><value><struct><member><name>name</name><value><string>A</string></value></member></struct></value><value><struct><member><name>name</name><value><string>B</string></value></member></struct></value></data></array></value></data></array>")),
    ) as unknown as typeof fetch;
    const res = await testConnection(fetchImpl);
    expect(res.connected).toBe(true);
    expect(res.subaccounts).toBe(2);
    expect(res.mode).toBe("shadow");
    expect(res.outboundEnabled).toBe(false);
    expect(res.corporateCode).toBe("EA217");
    // token must never appear in the sanitized result
    expect(JSON.stringify(res)).not.toContain("test-token-123");
  });

  it("surfaces WuBook auth failure without leaking the token", async () => {
    const fetchImpl = vi.fn(async () =>
      xmlResponse(OK_XML("<array><data><value><int>-1</int></value><value><string>Invalid token test-token-123</string></value></data></array>")),
    ) as unknown as typeof fetch;
    const res = await testConnection(fetchImpl);
    expect(res.connected).toBe(false);
    expect(res.errorCode).toBe("wubook_error_-1");
    expect(JSON.stringify(res)).not.toContain("test-token-123");
  });

  it("handles malformed XML", async () => {
    const fetchImpl = vi.fn(async () => xmlResponse("<html>not xml</html>")) as unknown as typeof fetch;
    const res = await testConnection(fetchImpl);
    expect(res.connected).toBe(false);
    expect(res.errorCode).toBe("no_response_param");
  });

  it("handles network timeout", async () => {
    const fetchImpl = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    ) as unknown as typeof fetch;
    const res = await testConnection(fetchImpl);
    expect(res.connected).toBe(false);
    expect(res.errorCode).toBe("request_timeout");
  });
});
