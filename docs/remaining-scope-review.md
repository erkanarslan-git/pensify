# Kalan kapsam — 23.10.2026 güncel kod incelemesi

Kaynak: `Pensify_ın_mevcut_kodunu_daha_önce_pasted-2.md`. Başlangıç HEAD: `e449004`.
Eski roadmap tamamlandı işaretleri kanıt kabul edilmedi. Üretim rezervasyon/mesai/tahsilat kayıtları test amacıyla değiştirilmedi.

## Öncelikli TV listesi
- Tamamlandı: `loadActiveTvDisplays` veritabanında `revoked_at IS NULL` filtresi kullanır; iptal sonrası sorgu yenilenir, başka oturumdaki iptal 30 saniyelik yenilemede kaybolur.
- İptal geçmişi silinmez; geçersiz token yeniden kullanılmaz. TV ekranının tasarımı değişmedi.
- 1 kural testi ve gerçek sahip oturumunda aktif liste isteği/geçici başlığın yokluğu doğrulandı.

## 1. Yetkiler — uygulanmış, kapsamlı canlı test kısmi
- `0063_owner_reports_and_finance_operations.sql`, `work-report.functions.ts`, `finance-access.ts`: yalnız sahip iş raporu; ayrı finans işlem izinleri.
- Önceki turdaki uygulama korundu; bu tur 7 finans kural testi yeniden geçti.
- Ayrı roller/A-B firma doğrudan RPC, SQL izolasyonu, gerçek ters kayıt testi tamamlandı sayılmaz. Ayrı yetkili test ortamı gerekir.

## 2. Rezervasyon — bu tur tamamlanan uygulama
- `reservation-list.functions.ts`: oturum, aktif firma ve `can_access_property` ile sunucu kapsamı; 10/20/30/40/50 sayfa, tam toplam, tarih/kaynak/durum/lokasyon/isim/firma/oda filtreleri.
- `reservation-list.ts`: liste/export aynı filtre ve kararlı tarih+ID sıralaması; 500 kayıtlık parçalarla tüm CSV, formül güvenliği.
- `reservations.tsx`: 300ms arama gecikmesi, filtreli sorgu anahtarı ve iptal sinyali, filtre/sayfa boyutunda sıfırlama, kapsamlı sunucu sayaçları. Eski limit(1000)/istemci slice kaldırıldı.
- `calendar-data.functions.ts`: görünür 7/14/30 gün ve lokasyon kapsamında sorgu; bugünün doluluğu görünür tarih dışındayken ayrı dar sorguyla korunur. İlk gün çıkışlarını da içerir. Eski yanıtlar uygulanmaz.
- Test: 9 filtre/sayfa/DST/1234-kayıt export/CSV/takvim kuralı geçti. Gerçek sahip hesabında tek mevcut rezervasyon, tam CSV, gerçek ad araması, eşleşmeyen ve noktalama araması, sıralama, sayfa boyutu, 7/14/30 gün, DE/EN/TR, telefon taşma ve tarayıcı hata kontrolü geçti.
- Sınır: gerçek hesapta yalnız 1 silinmemiş rezervasyon olduğu için canlı ikinci sayfa/1000 üzeri kayıt testi yapılamadı; 1234 satırlık testte parçalama ve kayıp/tekrar kontrol edildi. Firma/rol izolasyon SQL testi ayrıca bekler.

## 3. Mesai — sıradaki, eksik
- `daily-time.ts` başlangıç gününe topluyor; Berlin gece/DST/mola gün dağıtımı eksik.
- `0057_clock_exit_location_and_stale_review.sql` ve `0040_attendance_hardening.sql` bilinmeyen çıkış için giriş anını yazarak kapatıyor; boş gerçek çıkışlı inceleme modeli ve ayarlanabilir eşikler gerekli.
- Saatlik job gerçek kurulum/son başarı/hata ve bildirimin tekilleştirilmesi ayrıca doğrulanmalı; fonksiyonun varlığı kurulum kanıtı değil.

## 4. Temizlik — kısmi
- `room_issues`/bakım atama ve çözüm geçmişi mevcut.
- Lokasyon bazlı kontrol tercihleri, kontrolcü/zaman/sonuç, gerekçeli yeniden açma ve problem/kontrol bekleyen ayrımı eksik inceleme/uygulama.
- Kategoriyle açıklamasız bildirim mevcut form ve SQL kuralları birlikte ele alınacak; TV tasarımı korunacak.

## 5. Genel görevler — kısmi
- `todos.tsx` liste/takvim/öncelik mevcut; 1000 kayıt sınırı var.
- Atama, ilişkiler, saat, detay not/geçmiş, güvenli ek, tekil tekrar ve gerçek gönderim durumu henüz tamamlanmadı. Yeni paralel modül açılmayacak.

## 6. Misafirler / firmalar — eksik
- Ayrı istenen ekran yok; rezervasyon/booking kaynakları kullanılmalı, isim benzerliğine göre birleşme yapılmamalı.
- Sunucu sayfalaması, yetkili detay/iletişim ve finans izni yoksa mali alanların yanıtta bulunmaması gerekli.

## 7. Tahsilat — kısmi
- Plan, ödeme ve ayrı izinler mevcut; `payments.index.tsx` limit(5000) ve istemci toplamları eksik.
- `0044_payment_schedules_and_payments.sql` rezervasyon FK CASCADE davranışı mali geçmiş koruma açısından ele alınmalı.
- Dağıtım/avans/depozito, idempotent/eşzamanlı sınırlar, kesin para hesabı ve silme koruması uçtan uca tamamlandı sayılmıyor.

## 8. Entegrasyon merkezi — kısmi
- Mevcut banka/kanal ekranları korunacak, ortak giriş eksik.
- `bank/providers.server.ts` sağlayıcı kaydı boş: gerçek Sparkasse bağlantısı yok. Sözleşme/erişim dış bağımlılık; uydurma bağlı durumu yok.
- WuBook pilot/inbox/outbox ve kapalı import/stok korumaları korunacak.

## 9. Erişim bilgileri — kısmi
- Oda kodu mevcut; bina/oda/anahtar türleri, ayrı izinli dar reveal, geçerlilik ve sır içermeyen görüntüleme audit'i henüz tam doğrulanmadı.
- Varsayılan maskeleme tek başına sunucu güvenliği kanıtı değildir.

## 10. TV — görünüm korunuyor, doğrulama kısmi
- `tv.ts`/`tv.test.ts`: 32 anonim DTO/sayaç/delta/reconnect/tekilleştirme/dönüş testi bu tur yeniden geçti.
- Sıfırdan farklı gerçek günlük temiz/bakım/ödeme, kontrol/problem ayrımı ve gerçek yeni rezervasyon konfeti/ses için ayrı test ortamı gerekir. Üretim verisi eklenmedi.
- Polling abonelik olarak raporlanmaz.

## 11. Yerelleştirme / tam güvenlik — devam ediyor
- Bu turdaki yeni kontroller DE/EN/TR doğrulandı; eski takvim hardcoded metinleri ve diğer ekranlar ayrı tarama bekliyor.
- A/B firma, sahip dışı red, şef kapsamı, dosya/TV ve eşzamanlılık SQL testleri uygun yetkili ortam olmadan geçti sayılmaz.
- Fiziksel QR/GPS gerçek cihaz/lokasyon gerektirir; üretim güvenliği gevşetilmez.