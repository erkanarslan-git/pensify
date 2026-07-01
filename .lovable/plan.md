# Canlıya Çıkış Öncesi Kapsamlı Test Planı

Amaç: Backend (RLS, RPC, tetikleyiciler), frontend (light + dark mod, tüm ana sayfalar), rol bazlı erişim ve güvenlik açıklarını sistematik olarak taramak ve kritik bulguları düzeltmek.

## Faz 1 — Otomatik Güvenlik & SQL Taramaları

1. **Supabase Linter** çalıştır (`supabase--linter`) — RLS eksik, güvensiz view, mutable search_path, expose edilen tablo/kolon.
2. **Security Scanner** çalıştır (`security--run_security_scan` + `security--get_scan_results`) — Wiz/Lovable tarafındaki bulguları çek.
3. **Grants matrisi** — her `public` tablo için `authenticated`, `anon`, `service_role` yetkilerini `information_schema.role_table_grants` üzerinden doğrula. Beklenmedik `anon` erişimi flag'le.
4. **Column-level revokes** — hassas kolonlar (`hourly_rate`, `qr_token`, `ical_feed_token`, `paid_*`, `email`, tel, adres) hâlâ `authenticated` rolüne kapalı mı? Regresyon kontrolü.
5. **RLS policy inceleme** — 20 tablo için politikaları oku, `USING (true)` / `WITH CHECK (true)` gibi izin fazlası kalıpları raporla.
6. **Fonksiyon güvenliği** — tüm `SECURITY DEFINER` fonksiyonların `search_path` set edilmiş mi ve caller-authorization içeriyor mu (has_role kontrolü)?

## Faz 2 — Backend Fonksiyonel Testleri (psql)

Her rol için ayrı test tokenıyla (owner, admin, manager, reception, cleaner, anonim) aşağıdaki senaryolar:
- Reservations CRUD (bugünkü + geçmiş tarih)
- Cleaning task oluşturma / atama / status güncelleme
- Time entries: start / pause / resume / end + payment field koruması
- Access request akışı (yeni kullanıcı → admin onayı)
- QR token & ical feed token erişimi (sadece RPC üzerinden)
- Overlap engelleme trigger'ı, past-reservation trigger'ı, audit log yazımı

Sonuçlar bir tabloya (beklenen vs gerçek) yazılır.

## Faz 3 — Frontend Tarama (Playwright, headless Chromium)

Her ana route için hem **light** hem **dark** modda ekran görüntüsü ve konsol/network hata taraması:

Routes: `/auth`, `/`, `/calendar`, `/reservations`, `/rooms`, `/cleaning`, `/cleaners`, `/dispatch`, `/notifications`, `/ai`, `/properties`, `/time-tracking`, `/team`, `/channel-sync`, `/settings`, `/me`, `/geo-test`, `/request-access`.

Her sayfada kontrol:
- Console error / warning
- Failed network request (>=400)
- Boş liste durumu (data var mı, RLS yüzünden mi boş?)
- Kritik butonlar tıklanabilir mi
- Dark modda kontrast, hardcoded renk (`text-white`, `bg-black`, `#hex`) sızıntısı

## Faz 4 — Rol Bazlı E2E Akışlar (Playwright + Supabase session inject)

Beş rol için ayrı hesap oluşturup ana akışları koştur:
1. **Owner** — tam erişim doğrulaması
2. **Admin** — team yönetimi, access request onayı
3. **Manager** — geçmiş rezervasyon düzenleme, cleaning atama
4. **Reception** — sadece güncel rezervasyon, geçmişte engel
5. **Cleaner** — sadece `/me`, `/cleaning`, `/clock`; diğerleri 403/redirect

Her rol için yasak route'ların gerçekten yönlendirdiğini doğrula.

## Faz 5 — Statik Kod Taraması

- `rg` ile hardcoded renk: `text-white|bg-black|bg-\[#|text-\[#`
- `rg` ile `select("*")` çağrıları (kolon revoke edilmiş tablolarda bomba)
- `rg` ile `dangerouslySetInnerHTML`, `eval(`, `new Function(`
- `rg` ile `process.env` client bundle'a sızıntısı
- `bun run build` — üretim build hatasız mı

## Faz 6 — Bulguların Raporlanması & Düzeltme

Her faz sonunda bulgular şu formatta:
- **Kritik** (güvenlik/veri sızıntısı) → derhal düzelt
- **Yüksek** (fonksiyonel bug) → düzelt
- **Orta** (UX, kontrast) → düzelt
- **Düşük** (kozmetik) → not al, kullanıcıya bildir

Her düzeltmeden sonra ilgili test yeniden koşulur.

## Teslimatlar

- Faz 1-2 sonuç raporu (metin)
- Faz 3 için light/dark ekran görüntüleri (`/tmp/browser/audit/`)
- Faz 4 rol matrisi (beklenen vs gerçek)
- Düzeltilmiş dosyaların özeti
- Kalan riskler ve canlıya çıkış öncesi manuel doğrulanması gerekenler

## Tahmini Süre & Kredi

Yaklaşık 15-25 tool çağrısı; büyük çoğunluğu paralel çalıştırılabilir. Kritik bulgu sayısına göre ek düzeltme turları gerekebilir.

---

**Onaylarsan Faz 1 ile başlıyorum. Belirli bir role veya sayfaya öncelik vermek ister misin (örn. sadece güvenlik + cleaner akışı)?**
