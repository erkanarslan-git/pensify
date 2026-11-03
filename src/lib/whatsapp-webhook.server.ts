// Server-side helpers for the Meta WhatsApp Cloud API webhook.
// Shared by /api/public/webhooks/whatsapp and /api/public/whatsapp/webhook.

const DEFAULT_VERIFY_TOKEN = "pensify_wa_2026";

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

/**
 * Durably store every delivery in the whatsapp_webhook_events inbox before
 * acknowledging. A failed database write returns 5xx so the sender retries.
 * Duplicate delivery ids (retries) are ignored; real processing happens on the
 * stored rows when the guest-message flow is connected.
 */
export async function receiveEvent(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const event = request.headers.get("x-lovable-event") ?? fieldFromMeta(payload) ?? "unknown";
  const deliveryId = request.headers.get("x-lovable-delivery");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("whatsapp_webhook_events").insert({
    delivery_id: deliveryId,
    event,
    payload: payload as Record<string, unknown>,
    processed_at: new Date().toISOString(),
  });
  if (error) {
    // Duplicate delivery of an already-stored id is not a failure.
    if ((error as { code?: string }).code === "23505") return new Response("ok", { status: 200 });
    console.error("[whatsapp webhook] inbox write failed:", error.message);
    return new Response("Server Error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
