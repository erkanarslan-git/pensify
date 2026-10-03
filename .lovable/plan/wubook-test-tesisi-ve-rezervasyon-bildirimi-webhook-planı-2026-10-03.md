# WuBook test tesisi ve rezervasyon bildirimi (webhook) planı

Amaç: Gerçek müşteri odalarına ve Booking/Airbnb/Expedia'ya dokunmadan, ayrı bir "Pensify API Test" tesisi üzerinden WuBook'un rezervasyon bildirimlerinin Pensify'a güvenle ulaştığını kanıtlamak. Bu turda dış sistemde hiçbir şey oluşturulmaz; kod hazırlanır, test tesisi bilgileri raporlanır, sonra sizin ayrı onayınız beklenir.

## Ne göreceksiniz (Kanal Senkronizasyonu sayfası, yalnız sahip/admin)
1. **Test tesisi oluştur** – form (tesis adı, adres, posta kodu, şehir, telefon, iletişim/rezervasyon e-postası, hesap sahibi adı/soyadı/e-posta/telefon; ülke DE, saat dilimi Europe/Berlin, dil de, para birimi EUR sabit). Önce gönderilecek verilerin özeti ve uyarı, sonra açık onay. İkinci kez basılırsa ikinci tesis oluşmaz. WuBook'un verdiği şifre yalnızca bir kez gösterilir, hiçbir yerde saklanmaz/loglanmaz.
2. **WuBook Webhook testen** – WuBook'tan test bildirimi ister; durum adımları: başlatıldı → WuBook kabul etti → Pensify'a ulaştı → 200 döndü, zaman ve test kodları (1000/2000). Rezervasyon oluşmaz.
3. **Kayıtlı adres kontrolü** – Pensify'ın beklediği adres ile WuBook'ta kayıtlı adres yan yana, eşleşiyor/eşleşmiyor, son kontrol zamanı. Gizli anahtar maskeli.
4. **Salt okunur rezervasyon testi** – "API erişimi başarılı · Test tesisi: [kod] · Bekleyen rezervasyon: N · Hiçbir veri değiştirilmedi".

## Adımlar
1. Veritabanı: test tesisi kodlarını kanal hesabına bağlama, gelen bildirim kutusu (inbox), idempotency kısıtları.
2. WuBook istemcisine 5 yeni yöntem, sıkı izin listesiyle.
3. Herkese açık webhook adresi (gizli anahtarlı), hızlı 200, yalnız kayıt.
4. Yönetim fonksiyonları + arayüz kartları + de/en/tr metinleri.
5. Testler, build, rapor. Gerçek test tesisi **oluşturulmaz** — onayınız beklenir.

## Teknik detaylar
- **Migration (Lovable migration aracı):**
  - `channel_accounts`: `wubook_acode text`, `wubook_lcode text`, `is_test boolean default false`, `webhook_secret_hash text`, `last_push_url_check jsonb`; unique `(organization_id, provider, wubook_lcode)`; kısmi unique `(organization_id, provider) where is_test` → çift test tesisi engeli.
  - `wubook_inbox`: org, account_id, lcode, rcode, event_type (`test`/`booking`), status (`test_received`, `received_not_processed`, `unknown_lcode`, `processed`, `failed`), received_at, sınırlı `meta jsonb` (ham body yok); unique `(lcode, rcode, event_type)`; GRANT + RLS (okuma: org admin; yazma yalnız service role). `tenant_isolation.sql` genişletilir.
  - Bilinmeyen lcode için org bilinmediğinden satır, kayıtlı hesap yoksa yazılmaz (yalnız sayaç/200) — org'suz satır yok.
- **service.server.ts:** izin listesi genişletilir: okuma `push_url`, `fetch_booking`, `fetch_new_bookings` (mark=0 zorunlu, başka değer guard'da reddedilir); yönetim `corporate_new_account_and_property`, `push_activation` yalnızca açık "admin action" bayrağıyla ve yalnız test hesabının lcode'u için. `mark_bookings` ve tüm availability/rate/restriction yöntemleri kalıcı olarak engelli. Tüm yanıtlar `[status, payload]` ile doğrulanır; hatalar token/şifre/secret'tan arındırılır.
- **Webhook:** `src/routes/api/public/webhooks/wubook/$secret.tsx`. Secret, secret store'daki `WUBOOK_WEBHOOK_SECRET` (generate_secret ile üretilir) ile sabit zamanlı karşılaştırılır; URL loglanmaz. `application/x-www-form-urlencoded`, 4 KB sınırı, rate limit, zod ile lcode/rcode. 1000/2000 → `test_received`, fetch_booking çağrılmaz. Gerçek lcode → eşleşen hesap; `WUBOOK_RESERVATION_IMPORT_ENABLED` kapalıyken `received_not_processed`. Tekrar gelen bildirim `on conflict do nothing`. Her durumda hızlı 200 (yetkisiz secret → 404).
- **Sunucu fonksiyonları (`wubook.functions.ts`):** `createWuBookTestProperty`, `startWuBookWebhookTest`, `checkWuBookPushUrl`, `fetchWuBookNewBookingsReadOnly`, `getWuBookWebhookStatus`; hepsi `requireOrgRole(ADMIN_ROLES)`, rate limit, audit log (gizli bilgisiz). Admin istemci handler içinde dinamik import.
- **Testler (vitest + SQL):** listedeki 10 madde; ayrıca kaynakta `mark_bookings` geçmediğini doğrulayan test.
- Shadow modu ve outbound kapalı kalır; outbox'a satır yazılmaz.

## Sizden gereken
- Test tesisi formu için gerçek iletişim bilgileri (onaydan sonra, formda).
- Gerçek oluşturma için ayrı açık onay.
