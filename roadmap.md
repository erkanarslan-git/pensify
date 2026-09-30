# Roadmap — Faz 1 (Güvenlik & Veri Modeli)

## Adım 1–4 düzeltmeleri (inceleme sonrası)
- [x] .gitignore: .env ve .env.* yok sayılıyor, .env.example hariç. Geçmişte .env yalnızca herkese açık anahtarlar içeriyordu (URL, publishable key, proje kimliği); gizli anahtar yok.
- [x] .env dosyası Git takibinden çıkarıldı (kullanıcı GitHub tarafında kaldırdı).
- [x] Paket yöneticisi Bun olarak belirlendi, package-lock.json kaldırıldı; temiz `bun install --frozen-lockfile` ve production build geçti.
- [x] Tek migration yolu belgelendi (AGENTS.md).
- [x] Yetki yalnızca organization_members.role'e dayanıyor; global rol eşitlemesi kaldırıldı.
- [x] Her organizasyon ve kullanıcı için tek üyelik satırı var.
- [x] default_organization_id() artık tahmin yapmıyor; organizasyon bağlamı yoksa yazma reddediliyor.
- [x] Mülk erişimi atama gerektiriyor; atamasız reception/cleaner mülk göremiyor.
- [x] Ayarlar, yetkiler, iCal ve dış rezervasyon kimlikleri organizasyona özel.
- [x] Manuel senkronizasyon organizasyona özel: yetki kontrolü, sorgular, yazmalar ve bekleme süresi.
- [x] Sabah dispatch'i her organizasyonu ayrı işliyor: ayarlar, saat dilimi, kayıtlar.
- [x] SQL izolasyon testleri (supabase/tests/tenant_isolation.sql) geçti; testler dispatch ve sync kapsamını SQL düzeyinde kapsamıyor, sync canlı çağrıyla doğrulandı.
- [ ] Dispatch canlı testi — ertelendi: kullanıcı anahtarları daha sonra verecek

## Sonraki adımlar (düzeltmeler kabul edilince)
- [x] Personel için mülk atama ekranı (Team → Häuser)
- [x] Adım 5: room_types, rate_plans, occupancy_rates, channel_room_mappings (tenant-scoped unique, same-org trigger, RLS) — migration 0005 uygulandı
- [x] Adım 6: Atomik rezervasyon RPC + otomatik fiyat (room_type_id, quote_room_price, Zimmertypen & Preise) — integration_outbox WuBook planına ertelendi
- [x] Adım 7: Sunucu tarafı clock_start/clock_toggle_break/clock_stop — QR rotasyonu kullanıcı onayı bekliyor (basılı QR'lar geçersiz olur)
- [x] Adım 8: transition_cleaning_task (izinli geçişler + oda durumu)
- [x] Adım 9: room_operational_status view (security_invoker) + Rooms sayfası
- [x] Adım 10: lint raporu — 2946 prettier (yalnız biçim), 156 no-explicit-any, 6 only-export-components, 4 exhaustive-deps, 2 prefer-const; gerçek hata yok
- [ ] Sonraki: WuBook planlaması (iCal kaldırma dahil)
