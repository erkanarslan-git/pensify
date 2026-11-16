import { createFileRoute } from "@tanstack/react-router";
import { parseElevenLabsCall } from "@/lib/voice-agent";

async function validSignature(header: string | null, body: string, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t, v0 = parts.v0;
  if (!t || !v0 || Math.abs(Date.now() / 1000 - Number(t)) > 30 * 60) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v0.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v0.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/webhooks/elevenlabs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        if (body.length > 2_000_000) return new Response("Too large", { status: 413 });
        if (!(await validSignature(request.headers.get("elevenlabs-signature"), body, secret))) return new Response("Invalid signature", { status: 401 });
        let parsed;
        try { parsed = parseElevenLabsCall(JSON.parse(body)); } catch { return new Response("Bad request", { status: 400 }); }
        if (!parsed) return new Response("ignored");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin.from("voice_agent_settings").select("organization_id").eq("agent_id", parsed.agentId).maybeSingle();
        if (!settings) return new Response("ignored");
        const { error } = await supabaseAdmin.from("voice_calls").upsert({ ...parsed.row, organization_id: settings.organization_id }, { onConflict: "organization_id,external_id" });
        if (error) { console.error("voice call save failed", error.message); return new Response("error", { status: 500 }); }
        return new Response("ok");
      },
    },
  },
});
