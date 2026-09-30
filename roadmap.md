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
- [ ] Adım 6: Atomik rezervasyon RPC + fiyat alanları + integration_outbox
- [ ] Adım 7: Sunucu tarafı QR/konum doğrulama, QR hash/rotasyon
- [ ] Adım 8: Temizlik görevi durum geçiş RPC'leri
- [ ] Adım 9: Hesaplanan oda operasyonel durum görünümü
- [ ] Adım 10: lint raporu
- [ ] Sonraki: WuBook planlaması (iCal kaldırma dahil)
