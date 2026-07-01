import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildAiTools } from "@/lib/ai-tools.server";

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

        // Build a Supabase client that acts as the calling user (RLS applies).
        const supabase = createClient<Database>(supabaseUrl, supabasePublishable, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        // Role gate: only owner/admin/manager
        const roleChecks = await Promise.all(
          (["owner", "admin", "manager"] as const).map((r) =>
            supabase.rpc("has_role", { _user_id: userData.user!.id, _role: r }),
          ),
        );
        const allowed = roleChecks.some((r) => r.data === true);
        if (!allowed) return new Response("Forbidden", { status: 403 });

        const body = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(body.messages)) {
          return new Response("Messages required", { status: 400 });
        }

        const gateway = createLovableAiGatewayProvider(lovableKey);
        const model = gateway("google/gemini-3-flash-preview");

        const today = new Date().toISOString().slice(0, 10);
        const system = `Sen Pensify pansiyon işletme sisteminin dahili AI asistanısın.
Kullanıcının rolü: yönetici (owner/admin/manager).
Bugünün tarihi: ${today}.
Görevin: doluluk, boş oda, ciro, kanal dağılımı, temizlik yükü ve yıllık değerlendirme sorularını verilen tool'ları çağırarak yanıtlamak.

Kurallar:
- Tarih aralığı gerektiren tüm sorularda tool çağırmadan önce eksik tarihleri makul biçimde tamamla (örn. "bu yıl" → ${today.slice(0, 4)}-01-01 → ${today.slice(0, 4)}-12-31).
- "to" tarihi rezervasyonda dahil değildir (checkout günü).
- Oda numarası geçen sorularda önce check_room_availability veya list_rooms kullan.
- Ciro/doluluk/oran gibi rakamları asla tahmin etme; tool sonucundan al.
- Kısa, madde imli, Türkçe yanıtla. Yüzdeleri % ile ver, para birimini € olarak yaz.
- Öneri istendiğinde önce ilgili tool'u çağır (yearly_review veya occupancy_stats), sonra veriye dayanan somut 3-5 öneri sun.
- Kişisel misafir bilgisi (isim/e-posta) yayma; gerekmedikçe misafir adı gösterme.`;

        const result = streamText({
          model,
          system,
          messages: convertToModelMessages(body.messages),
          tools: buildAiTools(supabase),
          stopWhen: stepCountIs(12),
        });

        return result.toUIMessageStreamResponse({ originalMessages: body.messages });
      },
    },
  },
});
