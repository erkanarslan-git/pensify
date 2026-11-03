import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authenticateDelivery, verifyChallenge } from "./whatsapp-webhook.server";

const APP_SECRET = "test_app_secret";
const GATEWAY_SECRET = "test_gateway_secret";

const WEBHOOK_URL = "http://localhost/api/public/whatsapp/webhook";

function hubSignature(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

function post(body: string, headers: Record<string, string> = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

const PAYLOAD = JSON.stringify({
  entry: [{ changes: [{ field: "messages", value: { messages: [{ id: "wamid.TEST" }] } }] }],
});

describe("verifyChallenge", () => {
  it("echoes hub.challenge for the configured verify token", async () => {
    const res = await verifyChallenge(
      new Request(
        `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=pensify_wa_2026&hub.challenge=TEST123`,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("TEST123");
  });

  it("rejects a wrong verify token", async () => {
    const res = await verifyChallenge(
      new Request(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=TEST123`),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a missing verify token", async () => {
    const res = await verifyChallenge(new Request(`${WEBHOOK_URL}?hub.mode=subscribe&hub.challenge=TEST123`));
    expect(res.status).toBe(403);
  });
});

describe("authenticateDelivery", () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    process.env.WHATSAPP_API_KEY = GATEWAY_SECRET;
  });

  afterEach(() => {
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_API_KEY;
  });

  it("accepts a delivery signed with the Meta app secret", async () => {
    const auth = await authenticateDelivery(
      post(PAYLOAD, { "X-Hub-Signature-256": hubSignature(APP_SECRET, PAYLOAD) }),
    );
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect((auth.payload as any).entry[0].changes[0].field).toBe("messages");
    }
  });

  it("rejects a delivery signed with the wrong secret", async () => {
    const auth = await authenticateDelivery(
      post(PAYLOAD, { "X-Hub-Signature-256": hubSignature("other_secret", PAYLOAD) }),
    );
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("rejects an unsigned delivery", async () => {
    const auth = await authenticateDelivery(post(PAYLOAD));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("rejects a tampered body whose signature no longer matches", async () => {
    const signature = hubSignature(APP_SECRET, PAYLOAD);
    const tampered = PAYLOAD.replace("wamid.TEST", "wamid.OTHER");
    const auth = await authenticateDelivery(post(tampered, { "X-Hub-Signature-256": signature }));
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("accepts a delivery signed by the connector gateway", async () => {
    const timestamp = "1760000000";
    const signature = hubSignature(GATEWAY_SECRET, `${timestamp}.${PAYLOAD}`);
    const auth = await authenticateDelivery(
      post(PAYLOAD, { "X-Lovable-Signature": signature, "X-Lovable-Timestamp": timestamp }),
    );
    expect(auth.ok).toBe(true);
  });

  it("rejects a signed delivery when the app secret is not configured", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const auth = await authenticateDelivery(
      post(PAYLOAD, { "X-Hub-Signature-256": hubSignature(APP_SECRET, PAYLOAD) }),
    );
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(401);
  });

  it("rejects a body above the size limit", async () => {
    const huge = JSON.stringify({ entry: [{ changes: [{ field: "messages", value: "x".repeat(5 * 1024 * 1024) }] }] });
    const auth = await authenticateDelivery(
      post(huge, { "X-Hub-Signature-256": hubSignature(APP_SECRET, huge) }),
    );
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.response.status).toBe(413);
  });
});
