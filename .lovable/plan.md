# Pensify AI Asistan (Dahili)

Sadece giriş yapmış Admin/Owner/Manager rolleri için erişilebilir bir sohbet asistanı. Model çağrıları sunucuda, veriler sunucudaki güvenli araçlarla (tool calling) çekilir — böylece kullanıcı hiçbir gizli veri veya API anahtarı görmez, RLS bypass edilmez.

## Kullanım senaryoları
- "3 numaralı oda 15 Ağustos'ta boş mu?"
- "Ekim ayı doluluk oranımız nedir?"
- "Son 12 ayı değerlendir, en zayıf ve en güçlü aylar hangileri?"
- "Önümüzdeki yıl için fiyat/kanal önerileri"
- "Bu hafta temizlik yükü hangi pansiyonda yoğun?"

## Mimari

```text
UI (/ai, _authenticated)
  └─ useChat  →  POST /api/chat (server route, streamText)
                     ├─ requireSupabaseAuth (Manager+ kontrolü)
                     ├─ Lovable AI Gateway (google/gemini-3-flash-preview)
                     └─ Tools (server-side, aynı user'ın supabase client'ı):
                        - check_room_availability(room?, property?, from, to)
                        - list_free_rooms(from, to, property?)
                        - occupancy_stats(from, to, groupBy: day|month|property)
                        - revenue_stats(from, to, groupBy)
                        - cleaning_workload(from, to)
                        - top_channels(from, to)
                        - yearly_review(year)
```

Tool'lar SQL yerine mevcut `reservations`, `rooms`, `properties`, `cleaning_tasks`, `time_entries` tablolarından okunur; hesaplamalar (doluluk = dolu gece / (oda × gün)) sunucuda yapılır. Model yalnızca bu tool'ların döndürdüğü küçük, agrege JSON'u görür — ham müşteri PII'sı model'e gitmez.

## Güvenlik
- Route: `src/routes/_authenticated/ai.tsx` (mevcut auth gate).
- API: `src/routes/api/chat.ts` — handler içinde `supabase.auth.getUser()` + `has_role('admin'|'owner'|'manager')`; değilse 403.
- `LOVABLE_API_KEY` yalnızca sunucuda, `process.env` üzerinden.
- Tool'lardaki tüm sorgular kullanıcının kendi Supabase client'ıyla → RLS geçerli. Servis rolü kullanılmaz.
- `ROUTE_ACL`'e `/ai: ["owner","admin","manager"]` eklenir; menüde sadece bu rollere görünür.
- Reception ve Cleaner rolleri asistana erişemez.

## UI
- Yan menü "Yönetim" grubuna "AI Asistan" (Sparkles ikon).
- Tek sayfa sohbet: mesaj listesi + input + "Örnek sorular" chip'leri (yukarıdaki senaryolar).
- Streaming yanıt (AI SDK `useChat` + `DefaultChatTransport`).
- Alt bilgi: "Yanıtlar mevcut rezervasyon/oda verinize dayanır."

## Model & Maliyet
- Varsayılan: `google/gemini-3-flash-preview` (hızlı + ucuz, tool calling destekli).
- Kredi Lovable AI Gateway üzerinden düşülür; 402/429 hatalarında kullanıcıya net toast.

## Kapsam dışı (şimdilik)
- Sohbet geçmişinin veritabanına kalıcı kaydı — ilk sürüm oturum-içi (localStorage tabanlı, kullanıcı başına).
- Sesli giriş, çoklu dil optimizasyonu.
- Otomatik fiyat güncelleme aksiyonları (yalnızca öneri metni).

## Teknik değişiklikler
1. `src/lib/ai-gateway.server.ts` — Lovable Gateway provider helper.
2. `src/lib/ai-tools.server.ts` — tool tanımları (Zod input) + sorgu fonksiyonları.
3. `src/routes/api/chat.ts` — `streamText` + tools + rol kontrolü.
4. `src/routes/_authenticated/ai.tsx` — sohbet UI.
5. `src/lib/permissions.ts` — `/ai` ACL + menü grubu güncellemesi.
6. `src/components/app-shell.tsx` — menüye "AI Asistan".
7. Paket: `ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`, `zod` (mevcut).

Onaylarsan bu sırayla kurarım.
