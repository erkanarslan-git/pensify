# Faz 1 — Güvenlik Sertleştirme ve Temel Veri Modeli

Amaç: WuBook entegrasyonundan önce sistemi güvenli, çok şirketli (multi-tenant) ve tutarlı hale getirmek. Takvim, rezervasyon ekranları ve genel tasarım bu fazda değişmez. WuBook'a gerçek bağlantı yapılmaz. Mevcut veriler (pansiyonlar, odalar, kullanıcılar, rezervasyonlar) korunur, hiçbir şey silinmez.

Her adım ayrı yapılır; her adımdan sonra uygulamanın çalıştığı kontrol edilir.

## Adım 1 — Ortam ve gizli bilgiler
- `.env.example` oluşturulur (sadece değişken isimleri: SUPABASE_*, SYNC_CRON_SECRET, DISPATCH_CRON_SECRET, WUBOOK_*).
- Depo taranır: gizli anahtar, gerçek telefon, adres, koordinat, çalışan/misafir bilgisi var mı raporlanır. Varsa kurgusal verilerle değiştirilir.
- Git geçmişi otomatik yeniden yazılmaz; geçmişte kalan hassas veri raporlanır.

## Adım 2 — Açık uç noktaların korunması
- `/api/public/sync/manual`: artık giriş yapmış ve `manage_integrations` yetkisi olan kullanıcı gerekir. 401/403/429 cevapları, bekleme süresi (cooldown), denetim kaydı.
- `/api/public/hooks/dispatch-morning`: publishable key yerine `DISPATCH_CRON_SECRET` (sabit-zamanlı karşılaştırma). Her çalışma kaydedilir. Saat dilimi organizasyondan gelir (varsayılan Europe/Berlin).
- Booking/Airbnb webhook'ları: imzasız istekler reddedilir, "yapılandırılmadı" cevabı; boyut, içerik tipi, Zod doğrulama, event-ID (idempotency) hazırlığı, hız sınırı. Rezervasyon işlenmez.
- Güvenlik başlıkları: CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors. Google girişi ve şifre sıfırlama bozulmadan.

## Adım 3 — Organizasyon (çok şirketli) yapısı
- Yeni: `organizations`, `organization_members`, `member_property_access`.
- Roller: owner, admin, operations_manager, property_manager, reception, cleaner. (Mevcut "manager" → operations_manager olarak taşınır.)
- Mevcut kurulum için tek bir organizasyon oluşturulur; tüm kayıtlar ve kullanıcılar bu organizasyona bağlanır, roller korunur.
- Tüm işletme tablolarına `organization_id` eklenir, doldurulur, sonra zorunlu yapılır.

## Adım 4 — Veritabanı seviyesinde yetki (RLS)
- Yardımcı fonksiyonlar: `is_organization_member`, `has_organization_role`, `can_access_property`, `has_organization_permission`.
- Tüm tablo kuralları organizasyon + rol + pansiyon atamasına göre yeniden yazılır.
- Rol/kullanıcı yetkileri artık sadece butonu gizlemekle değil, veritabanında da uygulanır.
- Temizlikçi misafir e-posta/telefon ve ciro göremez; kanal şifreleri hiçbir zaman tarayıcıya gitmez.
- Doğrulama SQL testleri (A şirketi B'yi göremez vb.).

## Adım 5 — Oda tipi ve kişi sayısına göre fiyat modeli (sadece altyapı)
- Yeni: `room_types`, `rate_plans`, `occupancy_rates` (1/2/3 kişi fiyatı, tarih aralığı, min. konaklama, EUR, decimal).
- `rooms` tablosuna `room_type_id`, `active` eklenir; fiziksel oda temizlik ve atamada birim olarak kalır.
- Kanal eşleştirme hazırlığı: `channel_accounts`, `channel_property_mappings`, `channel_room_type_mappings` (wubook, booking, airbnb, expedia, website, manual). Şifreler istemcinin okuyabileceği alanda tutulmaz.

## Adım 6 — Rezervasyonun tek seferde (atomik) oluşturulması
- Tek bir güvenli veritabanı fonksiyonu: yetki, pansiyon erişimi, oda–pansiyon uyumu, kapasite, tarih, çakışma kontrolü → booking + oda satırları + denetim + `integration_outbox` kaydı. Herhangi biri hata verirse hiçbiri kaydedilmez.
- Pazarlık fiyatı alanları: liste fiyatı, son fiyat, indirim, gerekçe, değiştiren kişi/zaman. Fiyat farklıysa gerekçe zorunlu.
- Mevcut "Yeni Rezervasyon" penceresi bu fonksiyonu kullanacak şekilde bağlanır (görünüm aynı kalır).

## Adım 7 — Temizlikçi QR ve konum güvenliği
- Mesai başlat/bitir kararı sunucuda verilir (mesafe, GPS doğruluğu, üyelik, pansiyon erişimi).
- Varsayılan maksimum GPS hatası 150–200 m (şu an 2000 m). Koordinatsız pansiyon reddedilir (yönetici açıkça izin vermedikçe).
- Tüm denemeler (kabul/red) kaydedilir, hız sınırı, aynı anda tek açık mesai.
- QR: token özeti (hash) saklanır, yenileme/iptal/sürüm desteği; sadece admin/yönetici üretebilir.

## Adım 8 — Temizlik görevi durum akışı
- Fonksiyonlar: kabul et, başla, bitir, sorun bildir. Akış: bekliyor → kabul → devam → bitti / sorun; sorun → devam.
- Temizlikçi oda, pansiyon, atanan kişi, tarih gibi alanları değiştiremez. Yönetici gerekçeli override yapabilir.
- Bitirince oda durumu tek işlemde güncellenir; her geçiş kaydedilir.

## Adım 9 — Oda operasyonel durumu
- Dolu / bugün çıkış / temizlik gerekli / temizleniyor / hazır / bakım durumları rezervasyon + temizlik + bakım kayıtlarından hesaplanan bir görünümden gelir. Elle durum değiştirmek rezerveli odayı boş gösteremez.

## Adım 10 — Paket ve kod kalitesi
- Bun ana paket yöneticisi olarak belgelenir; çakışan `package-lock.json` kaldırılır.
- Dokunulan dosyalarda yeni `any` kullanılmaz; sadece değişen dosyalar biçimlendirilir; lint raporu.

## Testler ve teslim
- Brief'teki tüm test başlıkları (uç nokta, şirket izolasyonu, rezervasyon bütünlüğü, temizlikçi akışı) SQL + Playwright ile çalıştırılır.
- Sonunda: migration listesi, değişen dosyalar, rol-yetki matrisi, korunan uç noktalar, test/derleme sonuçları, gerekli ortam değişkenleri, geri alma notları, ertelenen işler.

## Brief ile platform arasındaki farklar (bilgi)
- `.env` dosyası Lovable tarafından otomatik yönetilir ve sadece publishable (herkese açık) anahtarları içerir; gerçek gizli anahtarlar güvenli kasada. `.env.example` eklenir, `.env` dosyasına dokunulmaz.
- `npm ci` yerine proje Bun kullanır; derleme Bun ile doğrulanır.
- Veritabanı değişiklikleri geriye dönük uyumlu (sadece ekleme) yapılır; eski sütunlar silinmez, "kullanımdan kalktı" olarak işaretlenir.
- iCal senkronizasyonu bu fazda kaldırılmaz; WuBook planlamasında birlikte kaldırılır.
- Cron gizli anahtarları (`DISPATCH_CRON_SECRET`, `SYNC_CRON_SECRET`) sistem tarafından otomatik üretilir.

## Ertelenenler
Takvim/rezervasyon/temizlikçi ekranı yeniden tasarımı, WuBook API çağrıları, canlı OTA bağlantısı, web sitesi rezervasyon arayüzü, ödeme, kapı PIN, WhatsApp, sesli asistan, AI eskalasyon.

## Teknik notlar
- `app_role` enum'a `operations_manager`, `property_manager` eklenir; `manager` satırları kopyalanır ve eski değer deprecated.
- `organization_id` akışı: nullable ekle → backfill → FK + index → NOT NULL (ayrı migration).
- Mevcut `prevent_reservation_overlap` trigger son savunma olarak kalır; ek olarak org/property tutarlılık trigger'ı.
- Manuel sync: `createServerFn` + `requireSupabaseAuth` + `has_organization_permission`; cooldown `sync_jobs` son kaydına göre.
- Güvenlik başlıkları `src/server.ts` yanıt sarmalayıcısında eklenir (preview iframe için frame-ancestors lovable domainlerine izinli).
- QR doğrulama: `clock_action(_token, _lat, _lng, _acc, _action)` SECURITY DEFINER RPC, haversine SQL'de.
