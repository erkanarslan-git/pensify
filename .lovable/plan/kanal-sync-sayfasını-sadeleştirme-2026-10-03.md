# Kanal-Sync sayfasını sadeleştirme

## Booking/Airbnb/Expedia bağlantısı nereden yapılır?
Bu platformlar **WuBook'un kendi panelinden** bağlanır (WuBook → Channel Manager → kanal ekle; platformun verdiği otel/ilan numarası girilir). Pensify sadece **WuBook'a** bağlanır. Yani zincir: Pensify ⇄ WuBook ⇄ Booking/Airbnb/Expedia. Pensify'da platform başına şifre/anahtar girmeye gerek yok.

## Yeni sayfa düzeni
1. **Bağlantı durumu (üstte)** — WuBook kartı: bağlı mı, son test zamanı, son veri geliş, son veri gönderiş, bekleyen/hatalı gönderim sayısı, "Bağlantıyı test et" düğmesi.
2. **Kanallar listesi** — sabit kanallar, her biri tek satır:
   - Booking.com, Airbnb, Expedia, Check24 → "WuBook üzerinden"
   - Web sitesi → "Web sitesi formu"
   - Privat (telefon / e-posta / kapıdan) → "Elle girilir"
   Her satırda: Aktif/Pasif anahtarı, son 30 gün rezervasyon sayısı, son rezervasyon ne zaman geldi, renk.
3. **Çakışmalar** — sadece varsa görünür (aynı kalıyor).
4. **Kayıtlar** — son gönderimler/gelişler listesi (sade).

## Kaldırılanlar
- iCal bağlantı kartları, toplu iCal yapıştırma, "Manuel sync", eski sync-job sekmesi.
- Var olan iCal kayıtları silinmez, sadece arayüzden kalkar ve kapatılır (geri dönüş mümkün).

## Teknik detaylar
- `reservation_channel` enum'una `expedia` eklenir (sadece ekleme, kırıcı değil); `guest-color` / renk ayarlarına Expedia eklenir.
- Kanal aktif/pasif ayarı `app_settings` içinde org bazlı `channels` anahtarı; yeni tablo yok.
- "Son geliş" = kanal başına en yeni rezervasyon `created_at`; "son gönderiş" = `integration_outbox.sent_at`; bekleyen/hatalı = outbox status sayıları.
- channel-sync.tsx yeniden yazılır; WuBook durum bileşeni korunur. WuBook gölge modda kalır, hiçbir canlı yazma çağrısı yok.
- Tüm metinler Almanca (uygulamanın geri kalanıyla aynı).
