import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  tool as aiTool,
  type UIMessage,
} from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildAiTools } from "@/lib/ai-tools.server";
import { buildPrivacyMap } from "@/lib/ai-privacy.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const supabase = createClient<Database>(supabaseUrl, supabasePublishable, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        const roleChecks = await Promise.all(
          (["owner", "admin", "manager"] as const).map((r) =>
            supabase.rpc("has_role", { _user_id: userData.user!.id, _role: r }),
          ),
        );
        if (!roleChecks.some((r) => r.data === true)) return new Response("Forbidden", { status: 403 });

        const body = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(body.messages)) return new Response("Messages required", { status: 400 });

        // ---------- Privacy layer ----------
        const privacy = await buildPrivacyMap(supabase);

        // Wrap tools: deanonymize inputs before running, anonymize outputs.
        const rawTools = buildAiTools(supabase);
        const wrappedTools: Record<string, unknown> = {};
        for (const [name, def] of Object.entries(rawTools)) {
          const t = def as any;
          wrappedTools[name] = aiTool({
            description: t.description,
            inputSchema: t.inputSchema,
            execute: async (input: any, opts: any) => {
              try {
                const real = privacy.deanonymizeJson(input);
                const result = await t.execute(real, opts);
                return privacy.anonymizeJson(result);
              } catch (e: any) {
                return { error: e?.message ?? "tool error" };
              }
            },
          });
        }

        // Anonymize user-visible message content before sending upstream.
        const anonMessages: UIMessage[] = body.messages.map((m) => ({
          ...m,
          parts: m.parts.map((p: any) =>
            p?.type === "text" ? { ...p, text: privacy.anonymizeText(String(p.text ?? "")) } : p,
          ),
        }));

        const gateway = createLovableAiGatewayProvider(lovableKey);
        const model = gateway("google/gemini-3-flash-preview");

        const today = new Date().toISOString().slice(0, 10);
        const system = `Sen Pensify pansiyon işletme sisteminin dahili AI asistanısın.
Kullanıcının rolü: yönetici (owner/admin/manager).
Bugünün tarihi: ${today}.

GİZLİLİK KURALLARI (çok önemli):
- Sistemdeki gerçek isimler dış modele hiç gönderilmez. Bunun yerine gizlilik kodları görürsün:
  • Misafirler: PSN_G01, PSN_G02, ...
  • Pansiyonlar: PSN_P01, PSN_P02, ...
  • Şehirler:   PSN_C01, PSN_C02, ...
  • Personel:   PSN_K01, PSN_K02, ...
- ${privacy.tokenGlossary()}
- Bu kodları ASLA çevirme, kısaltma, yorumlama veya değiştirme. Cevabında olduğu gibi kullan; sistem sunum aşamasında gerçek isimlere dönüştürecek.
- Kullanıcının yazdığı isim de senin gördüğünde bu kodlara çevrilmiş olabilir. Tool çağrılarında bu kodları aynen ilet.

Görevin: doluluk, boş oda, ciro, kanal dağılımı, temizlik yükü, yıllık değerlendirme ve "X misafir hangi odada?" gibi soruları tool'ları çağırarak yanıtlamak.

Diğer kurallar:
- Tarih aralığı için eksikleri makul biçimde tamamla (örn. "bu yıl" → ${today.slice(0, 4)}-01-01 → ${today.slice(0, 4)}-12-31).
- "to" tarihi rezervasyonda dahil değildir (checkout günü).
- "X hangi odada kalıyor?" sorularında find_guest_room tool'unu kullan.
- Rakamları tahmin etme; tool sonucundan al. Kısa, madde imli, Türkçe yanıtla. Yüzde %, para €.`;

        // Run the model with tools (non-streaming so we can safely
        // de-anonymize the final text without breaking multi-chunk tokens).
        const originalId = body.messages[body.messages.length - 1]?.id;
        try {
          const result = await generateText({
            model,
            system,
            messages: await convertToModelMessages(anonMessages),
            tools: wrappedTools as any,
            stopWhen: stepCountIs(12),
          });
          const finalText = privacy.deanonymizeText(result.text ?? "");

          const stream = createUIMessageStream({
            originalMessages: body.messages,
            execute: ({ writer }) => {
              const id = originalId ?? crypto.randomUUID();
              writer.write({ type: "text-start", id });
              writer.write({ type: "text-delta", id, delta: finalText || "…" });
              writer.write({ type: "text-end", id });
            },
          });
          return createUIMessageStreamResponse({ stream });
        } catch (e: any) {
          return new Response(e?.message ?? "AI error", { status: 500 });
        }
      },
    },
  },
});
