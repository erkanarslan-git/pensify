# Faz 1 Düzeltmeleri (Adım 1–4 yeniden açıldı)

Adım 5–10'a (oda tipleri, fiyat, rezervasyon, QR, temizlik) bu turda başlanmayacak. `roadmap.md`, Adım 1–4'ü testler geçene kadar "tamamlanmadı" olarak gösterecek.

## A. Depo hijyeni
1. **.env**: `.gitignore` dosyasına `.env` ve `.env.*` eklenecek, `!.env.example` istisnası olacak. Not: `.env` dosyasını platform yönetiyor ve içinde yalnızca herkese açık anahtarlar var (proje adresi, publishable key). Git geçmişi sadece okunarak (`git log -- .env`) taranacak ve rapor edilecek; hiçbir değer yazdırılmayacak. Git takibinden kaldırmayı (`git rm --cached`) ben çalıştıramıyorum, çünkü Git durumunu platform yönetiyor. Bu adım GitHub tarafında tek bir komut olarak size bırakılacak.
2. **Paket yöneticisi**: Bun esas alınacak (proje şablonu zaten Bun kullanıyor). `package-lock.json` silinecek, Bun sürümü `AGENTS.md` içine yazılacak, `bun install --frozen-lockfile` ile production build doğrulanacak.
3. **Migration sistemi**: Tek esas yol, platformun migration aracı olacak (Drizzle Kit kaydı + Supabase klasörü yalnızca geçmiş olarak kalacak). Uygulanmış migration'lara dokunulmayacak. Komut ve ortam gereksinimleri `AGENTS.md` içinde belgelenecek.

## B. Yetkilendirme modeli (tek migration, yalnızca ileri yönlü)
4. **Organizasyon rolleri**: RLS ve sunucu kontrolleri yalnızca `organization_members.role` kullanacak. Tenant verisindeki `has_role(...owner/admin)` kontrolleri (tetikleyiciler, RPC'ler, geçmiş rezervasyon kuralı, ödeme alanı koruması, admin RPC'leri) organizasyona göre çalışan kontrollerle değiştirilecek. `user_roles` → `organization_members` eşitlemesi yalnızca ilk organizasyon için bir kerelik taşıma olacak; tetikleyici kaldırılıp "DEPRECATED" olarak işaretlenecek.
5. **Üyelik yapısı**: Her organizasyon ve kullanıcı için tek üyelik satırı olacak (ana rol). Mükerrer satırlar en yüksek role göre birleştirilecek. Tekillik `(organization_id, user_id)` üzerinden sağlanacak. `member_property_access` bu kararlı üyeliğe bağlı kalacak.
6. **`default_organization_id()`**: Yedek seçim kaldırılacak. Kullanıcı tam olarak bir aktif organizasyonun üyesiyse onu döndürecek, aksi halde NULL döndürecek. `organization_id` sütunları NOT NULL olduğu için bağlam eksikse yazma işlemi reddedilecek. Sunucu tarafı işler `organization_id` değerini her zaman açıkça verecek.
7. **Mülk erişimi**: owner/admin/operations_manager organizasyondaki tüm mülklere erişecek. property_manager, reception ve cleaner yalnızca atandıkları mülklere erişecek. Ataması olmayan hiçbir mülke erişemeyecek.
8. **Tenant'a özel benzersiz anahtarlar**: `role_permissions (org, role, permission)`, `user_permissions (org, user, permission)`, `app_settings (org, key)`. Kanal entegrasyonu ve rezervasyon dış kimlikleri de `organization_id` içerecek şekilde güncellenecek.

## C. Sunucu işleri
9. **Manuel senkronizasyon**: Çağıran kişinin organizasyonu çözülecek (birden fazlaysa açıkça istenecek) ve `manage_integrations` o organizasyonda doğrulanacak. Sorgular yalnızca o organizasyonun entegrasyonlarına, odalarına ve mülklerine gidecek. `organization_id` tüm yazmalara açıkça eklenecek. Bekleme süresi organizasyon başına uygulanacak.
10. **Dispatch**: Her aktif organizasyon için döngü kurulacak. Ayarlar, saat dilimi, temizlikçiler, görevler ve mesajlar organizasyon bazında işlenecek. `cron_executions` her organizasyon için ayrı kaydedilecek.
11. İstemci tarafında yetki ekranları (`use-permissions`, Team, Settings) organizasyon rolünü okuyacak şekilde güncellenecek.

## D. Testler
12. Tekrarlanabilir SQL test betiği (`supabase/tests/tenant_isolation.sql`) iki geçici organizasyon ve kullanıcılar oluşturacak, şunları doğrulayacak ve sonunda tüm verileri temizleyecek:
    - A kiracısı B'nin verisini okuyamıyor, ekleyemiyor, güncelleyemiyor.
    - Global admin rolü başka organizasyonda yetki vermiyor.
    - property_manager, reception ve cleaner atanmamış mülke erişemiyor.
    - Aynı ayar anahtarı iki organizasyonda çakışmadan kullanılabiliyor.
    - Bağlam yoksa yazma işlemi reddediliyor.
13. Senkronizasyon ve dispatch için organizasyon kapsamı testi: seçilen organizasyon dışındaki kayıtlara dokunulmadığı kontrol edilecek.
14. `roadmap.md` güncellenecek: her maddenin test sonucu dürüstçe yazılacak.

## Riskler
- Rol modeli değişikliği mevcut kullanıcıların görünümünü etkileyebilir. Beş mevcut kullanıcı, eşdeğer organizasyon rollerine taşınacak ve her adımdan sonra giriş kontrol edilecek.
- Rezervasyon kuralı gibi mevcut kurallar korunacak, yalnızca yetki kaynağı değişecek.
