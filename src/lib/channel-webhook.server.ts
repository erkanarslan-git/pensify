import { z } from "zod";
import { clientIp, jsonError, rateLimited, readLimitedText, safeEqual } from "./http-security.server";

const MAX_BYTES = 64 * 1024;

const payloadSchema = z.object({
  event_id: z.string().min(1).max(200),
  event_type: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()).optional(),
});

// Channel webhooks are NOT processed in Phase 1. Unless a dedicated test
// secret (CHANNEL_WEBHOOK_TEST_SECRET) is configured and matches, every
// request gets a "not configured" answer. Nothing is written to the database.
export async function handleChannelWebhook(request: Request, channel: "booking" | "airbnb"): Promise<Response> {
  if (rateLimited(`wh:${channel}:${clientIp(request)}`, 30, 60_000)) return jsonError(429, "rate_limited");

  const testSecret = process.env["CHANNEL_WEBHOOK_TEST_SECRET"];
  if (!testSecret) return jsonError(403, "not_configured"); // 4xx: intentionally disabled, not a server fault

  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!provided || !safeEqual(provided, testSecret)) return jsonError(401, "unauthorized");

  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return jsonError(415, "unsupported_media_type");
  }
  const text = await readLimitedText(request, MAX_BYTES);
  if (text === null) return jsonError(413, "payload_too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonError(400, "invalid_json");
  }
  const result = payloadSchema.safeParse(parsed);
  if (!result.success) return jsonError(400, "invalid_payload");

  // Accepted for testing only — no reservation processing yet.
  return Response.json({ ok: true, accepted: false, event_id: result.data.event_id, reason: "processing_disabled" }, { status: 202 });
}
