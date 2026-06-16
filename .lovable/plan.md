## Genel Bakış

StayFlow'u backend + UX/UI olarak baştan aşağı revize edeceğim: gerçek auth, kullanıcı rolleri, çoklu dil ve yumuşak Blush & Lavender tasarım.

## 1. Backend — Lovable Cloud

Lovable Cloud'u aktive edip şu şemayı kuracağım:

- `app_role` enum: `owner`, `manager`, `cleaner` (şimdilik sadece owner aktif kullanılacak ama yapı hazır)
- `profiles` (id → auth.users, full_name, locale, avatar_url)
- `user_roles` (user_id, role) + `has_role(uuid, app_role)` security definer
- `cities`, `properties`, `rooms`, `reservations`, `cleaners`, `cleaning_tasks` tabloları
- Tüm `public` tablolarda RLS + `GRANT` (authenticated için)
- Owner her şeyi görür/yazar; manager atandığı property'ler; cleaner kendi task'leri (politikalar şimdiden yazılır)
- Yeni signup → otomatik `profiles` + `owner` rolü atayan trigger
- Realistic seed data migration (Berlin/Hamburg/Münih şehirleri, property, oda, rezervasyon)

## 2. Auth

- `/auth` public sayfası: E-posta/şifre + Google sign-in
- Tüm uygulama `src/routes/_authenticated/` altına taşınır (entegrasyon yönetimli gate)
- Root'ta `onAuthStateChange` listener
- Sign-out cache teardown
- Kullanıcı menüsü (avatar, e-posta, dil seçici, çıkış)

## 3. i18n (DE varsayılan, EN/TR)

- `i18next` + `react-i18next` + `i18next-browser-languagedetector`
- `src/i18n/locales/{de,en,tr}.json` — tüm sidebar, sayfa başlıkları, status'ler, butonlar
- Tarayıcı dili otomatik algılanır; algılanamazsa Almanca
- Sidebar'da dil seçici (DE/EN/TR)
- Tarih/sayı formatları locale'e göre

## 4. Tasarım — Blush & Lavender (softer)

- `src/styles.css` token'ları yenilenir:
  - Primary `#9b72cf` (lavender), accent `#e8c5d0` (blush), bg `#fdfafc`
  - Yumuşak gölgeler (`shadow-soft`), daha büyük border-radius (xl: 1rem)
  - Dark mode: koyu lavanta tonları
- Card/Button/Badge variant'ları yumuşatılır
- Sidebar: cam efekti, ince border'lar
- Status renkleri pastel tonlara çevrilir (yeşil/sarı/kırmızı yerine soft mint/peach/rose)

## 5. Grafikler

- Dashboard'a 3 yeni recharts grafik:
  - Haftalık occupancy (area chart)
  - Kanal dağılımı (donut)
  - Günlük temizlik tamamlama (bar)
- Analytics sayfası mevcut grafiklerle yeni paletle uyumlu hale getirilir

## Teknik notlar

- Server fn'ler `src/lib/*.functions.ts` altında, `requireSupabaseAuth` ile
- Demo veriler artık DB'den `useSuspenseQuery` ile çekilir
- `useTranslation()` hook'u tüm sayfalarda
- Tüm yeni tablolar için `GRANT` + RLS + owner-allow politikası

## Onayınızdan sonra

Tek seferde uygularım — auth ekranı, korumalı layout, dil değiştirici ve yeni palet hazır şekilde çalışır halde teslim ederim. Onaylar mısınız?