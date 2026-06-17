
# Pensify — Büyük Güncelleme Planı

Bu çok kapsamlı bir iş. Tek seferde değil, **4 aşamada** teslim edeceğim. Her aşama bağımsız test edilebilir.

---

## Aşama 1 — Rebrand + Veri Modeli + Audit Log (DB temeli)

**Frontend**
- Tüm "StayFlow" → **Pensify**: `app-shell.tsx`, `__root.tsx` title/meta, `auth.tsx`, üç i18n dosyası (de/en/tr).

**Veritabanı (migration)** — gerçek tablolar (artık demo değil):
- `cities`, `properties` (lat/lng + adres + qr_token unique), `rooms`, `cleaners`
- `reservations` — kanal (`booking|airbnb|check24|woocommerce|phone|direct`), kim girdi (`created_by`), `external_id`, `ical_uid`
- `cleaning_tasks`
- `time_entries` — temizlikçi shift'leri (clock_in, clock_in_lat/lng, break_minutes, clock_out, status, manual_override_by, note)
- `audit_logs` — global. Trigger ile her INSERT/UPDATE/DELETE'i `actor`, `entity`, `entity_id`, `action`, `diff` (jsonb) ile yazar.
- `channel_integrations` — pension başına iCal URL'leri + WooCommerce store URL + sync durumu
- 6 pensiyon seed: Bünde (Borriestr., Carl-Diem-Str., Vinckestr.), Löhne (Löhnerstr.), Bielefeld (Senner Hellweg), Osnabrück (Klarastr.). Eski demo şehir/pensiyonlar silinir, demo oda/rezervasyon yapısı korunur (yeni pension'lara taşınır).
- Roller: mevcut `owner` + `admin`, `manager`, `cleaner` eklenir.
- RLS: owner/admin tüm satırları görür; cleaner sadece kendi `time_entries` ve atandığı `cleaning_tasks`'ı görür/günceller; manager pension-scoped.

## Aşama 2 — Kanal Entegrasyonları

**Gerçekçi uyarı:** Booking.com ve Airbnb için **canlı çift yönlü API**, partner/channel-manager onayı ister (haftalar sürer, ticari sözleşme şart). Bu yüzden iki katmanlı kurarım:

1. **Şimdi çalışan kısım**
   - **Booking.com & Airbnb**: iCal import server function — pension başına URL kaydedilir, `/api/public/cron/ical-sync` her 30 dk poll eder (pg_cron tetikler). Rezervasyonlar `external_id` ile upsert; iptal/değişim handle edilir.
   - **WooCommerce**: connector kurulu — REST API ile ürün=oda, sipariş=rezervasyon iki yönlü sync.
   - **Check24 & Telefon**: hızlı manuel ekleme formu + kanal etiketi.

2. **API hazır altyapı**
   - `channel_integrations` tablosunda credential alanları (api_key, hotel_id, refresh_token) hazır.
   - Adapter pattern: `src/lib/channels/{booking,airbnb,woocommerce}.server.ts` — şimdilik iCal/REST, partner onayı gelince aynı interface'in altı doldurulur.

Her import kim/ne zaman/hangi kanal olarak **audit_logs**'a yazılır.

## Aşama 3 — Detaylı Filtreler (Calendar öncelikli)

**Calendar** (`/_authenticated/calendar`) — tam yeniden yazım:
- Sticky filter bar: Şehir → Pension → Oda (kademeli), kanal multi-select, tarih aralığı (1 hafta / 2 hafta / ay), arama.
- 3 view: **Liste** (mobil), **Timeline** (oda × gün grid — mevcut, geliştirilmiş), **Aylık** (klasik takvim).
- Filter state URL search params'ta (paylaşılabilir link) — TanStack zodValidator + fallback.
- Hücreye tıkla → yan panel: rezervasyon detayı, kanal rozeti, audit timeline (kim ne zaman değiştirdi).
- Renk kodu: kanal bazlı.

**Diğer listeler** (`reservations`, `rooms`, `properties`, `cleaning`, `cleaners`):
- Ortak `<DataFilterBar>` komponenti: arama + pension scope + duruma göre chip filtreler + tarih.
- Boş durum + sonuç sayısı.

## Aşama 4 — QR'lı Temizlikçi Zaman Takibi

**Pension tarafı**
- Her pension için yazdırılabilir QR kart sayfası (`/_authenticated/properties/$id/qr`) — büyük QR + pension adı + adres. URL: `https://app/clock/{qr_token}`.

**Temizlikçi akışı** (`/clock/$token` — auth gerekli, mobil-first)
1. Token doğrulanır → pension bulunur.
2. **Geolocation**: tarayıcı izin → 300m içinde mi? Değilse "Bu lokasyonda görünmüyorsunuz" + admin'e manuel başvuru butonu.
3. Açık shift var mı kontrol → duruma göre tek büyük buton:
   - **Çalışmaya Başla** (yeni shift, lat/lng kaydet)
   - **Ara Ver / Devam Et** (break toggle, dakika sayar)
   - **Bitir** (clock_out, toplam süre gösterilir, başka pension'a gidebilir)
4. Aynı kullanıcı başka pension QR'ı okutursa: aktif shift'i otomatik kapat + uyarı, yeni shift başlat.
5. Aynı QR aynı kullanıcıda açık shift varken → "Başla" pasif, sadece Ara/Bitir.

**Yönetici tarafı** (`/_authenticated/time-tracking`)
- Tüm shift'ler tablosu, filtre: kişi/pension/tarih aralığı/durum (aktif, tamamlanmış, manuel).
- **Manuel ekleme/edit**: unutulan giriş, devralma (admin başka birinin açık shift'ini kapatır), düzeltme — hepsi audit_log'a actor ile.
- **Ödeme raporu**: kişi seç + tarih aralığı (hafta/ay/yıl/custom) → toplam saat, pension dağılımı, CSV/PDF export, "ödendi" işaretleme (`paid_at`, `paid_by`, `paid_amount`).
- Harita: shift'in clock_in noktasını gösterir (suistimal tespiti).

---

## Teknik notlar (geliştirici)
- Tüm DB değişiklikleri tek migration (Aşama 1) + iCal cron job migration (Aşama 2).
- Server functions: `requireSupabaseAuth` ile; admin işlemleri `has_role` check'li.
- iCal parse: `node-ical` worker uyumlu mu kontrol → değilse minimal regex parser.
- Geolocation: Haversine formülü, accuracy >100m ise kullanıcıyı uyar ama kabul et (300m tolerans buffer veriyor).
- pg_cron: `/api/public/cron/ical-sync` 30dk, `/api/public/cron/auto-close-shifts` 6 saatte bir (24h üstü açık shift'leri otomatik kapatır + audit'e işaret).

## Sıralama önerim
Aşama 1 → onay → 2 → 3 → 4. Ya da hepsini ardışık çalayım, sen sonunda kontrol et. **Hangisini istersin?**

Migration onayı her aşama başında ayrıca soracağım.
