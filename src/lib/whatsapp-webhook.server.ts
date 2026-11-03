// Server-side helpers for the Meta WhatsApp Cloud API webhook.
// Shared by /api/public/webhooks/whatsapp and /api/public/whatsapp/webhook.

import { verifyWebhookSignature } from "@lovable.dev/webhooks-js";

const DEFAULT_VERIFY_TOKEN = "pensify_wa_2026";

// Meta's Business-app history chunks reach ~3 MB, above the 1 MiB library default.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Meta's subscription handshake: echo hub.challenge when the verify token matches. */
export async function verifyChallenge(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN;
  if (mode === "subscribe" && token === expected && /^[\w-]{1,200}$/.test(challenge)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

function fieldFromMeta(payload: unknown): string | null {
  const entry = (payload as { entry?: { changes?: { field?: unknown }[] }[] })?.entry?.[0]?.changes?.[0];
  return typeof entry?.field === "string" ? entry.field : null;
}

/** Read the request body, cancelling the stream as soon as the size limit is passed. */
async function readCappedBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export type DeliveryAuth =
  | { ok: true; body: string; payload: unknown }
  | { ok: false; response: Response };

/**
 * Every delivery must carry a signature that matches one of our secrets:
 *  - Meta sends X-Hub-Signature-256, an HMAC of the raw body with the app secret.
 *  - The Lovable connector gateway sends X-Lovable-Signature over "<timestamp>.<body>".
 * Unsigned or mismatched deliveries are rejected; nothing is stored.
 */
export async function authenticateDelivery(request: Request): Promise<DeliveryAuth> {
  const body = await readCappedBody(request);
  if (body === null) {
    return { ok: false, response: new Response("Payload Too Large", { status: 413 }) };
  }

  const hubSignature = request.headers.get("x-hub-signature-256");
  const lovableSignature = request.headers.get("x-lovable-signature");
  const lovableTimestamp = request.headers.get("x-lovable-timestamp");

  const appSecret = process.env.WHATSAPP_APP_SECRET || "";
  const gatewaySecret = process.env.WHATSAPP_API_KEY || process.env.LOVABLE_API_KEY || "";

  let verified = false;
  if (hubSignature) {
    if (!appSecret) {
      console.error("[whatsapp webhook] WHATSAPP_APP_SECRET is not configured; rejecting signed delivery");
      return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
    }
    verified = await verifyWebhookSignature({ signedPayload: body, signature: hubSignature, secret: appSecret });
  } else if (lovableSignature && lovableTimestamp) {
    if (!gatewaySecret) {
      console.error("[whatsapp webhook] no gateway secret configured; rejecting signed delivery");
      return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
    }
    verified = await verifyWebhookSignature({
      signedPayload: `${lovableTimestamp}.${body}`,
      signature: lovableSignature,
      secret: gatewaySecret,
    });
  }

  if (!verified) {
    console.error("[whatsapp webhook] delivery rejected: missing or invalid signature");
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, response: new Response("Bad Request", { status: 400 }) };
  }
  return { ok: true, body, payload };
}

/**
 * Durably store every verified delivery in the whatsapp_webhook_events inbox
 * before acknowledging. A failed database write returns 5xx so the sender
 * retries. Duplicate delivery ids are ignored; the guest-message flow picks
 * the stored rows up when it is connected.
 */
export async function receiveEvent(request: Request): Promise<Response> {
  const auth = await authenticateDelivery(request);
  if (!auth.ok) return auth.response;

  const event = request.headers.get("x-lovable-event") ?? fieldFromMeta(auth.payload) ?? "unknown";
  const deliveryId = request.headers.get("x-lovable-delivery");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("whatsapp_webhook_events").insert({
    delivery_id: deliveryId,
    event,
    payload: auth.payload as any,
  });
  if (error) {
    // Duplicate delivery of an already-stored id is not a failure.
    if ((error as { code?: string }).code === "23505") return new Response("ok", { status: 200 });
    console.error("[whatsapp webhook] inbox write failed:", error.message);
    return new Response("Server Error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
