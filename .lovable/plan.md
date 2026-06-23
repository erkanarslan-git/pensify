## Hedef

Temizlikçi WhatsApp chat ekranını kaldır. Yerine her sabah ayarlanan saatte her temizlikçiye o günkü sorumlu olduğu odaların listesi (simüle WhatsApp mesajı + kısa link) gitsin. Temizlikçi link tıklayarak veya `1`/`2` cevabıyla başla/bitir yapabilsin. Admin için manuel tetikleme arka kapısı.

İsim önerisi: **"Görev Dağıtımı" (Task Dispatch)** — sayfa adı `/dispatch`.

## Yapılacaklar

### 1. Ayarlar
`app_settings` tablosu (key/value JSON) ekle. Anahtarlar:
- `dispatch.morning_time` → "08:00"
- `dispatch.timezone` → "Europe/Istanbul"
- `dispatch.enabled` → true
- `dispatch.message_template` → Türkçe varsayılan şablon

Ayarlar sayfasına "Görev Dağıtımı" sekmesi: saat, zaman dilimi, aç/kapa, şablon önizleme.

### 2. Veri modeli
Yeni tablo `dispatch_messages` (her gönderilen WhatsApp simülasyon mesajı):
- cleaner_id, sent_at, scheduled_for (date), trigger ('auto'|'manual'|'resend'), task_ids (uuid[]), body (text), status ('queued'|'sent'|'delivered'|'failed'), provider ('simulation')

Yeni tablo `dispatch_replies` (cleaner'ın `1`/`2` cevapları için günlük):
- cleaner_id, received_at, raw_text, parsed_action ('start'|'end'|'unknown'), task_id, applied (bool)

`cleaning_tasks` zaten var; sadece bunlara linkliyoruz.

### 3. Server fonksiyonları (`src/lib/dispatch.functions.ts`)
- `dispatchMorningTasks()` — herkese veya tek cleaner_id'ye bugünün pending görevlerini grupla, mesaj oluştur, `dispatch_messages` yaz. Admin only.
- `resendForCleaner(cleanerId)` — manuel yeniden gönder.
- `getTodayDispatch()` — admin paneli için bugünkü dağılım + her cleaner'ın görev/durum sayıları.
- `simulateReply(cleanerId, text)` — `1`/`2` cevabını işle: aktif görev üzerinde clock_in/clock_out tetikle.

### 4. Cron (pg_cron)
- Her dakika çalışan tek cron, `app_settings.dispatch.morning_time` ile karşılaştırıp gün başına 1 kez `/api/public/hooks/dispatch-morning` çağırır.
- Public route handler: anon apikey kontrolü, `dispatchMorningTasks()` mantığını çalıştırır.

### 5. UI değişiklikleri
- `/whatsapp` sayfası **silinir**, sidebar'dan kaldırılır.
- Yeni `/dispatch` sayfası (admin/owner only):
  - Üstte "Bugün gönderim durumu" (saat, kaç cleaner, kaç görev)
  - Cleaner kartları: ad, atanan oda sayısı, durum rozetleri (pending/in_progress/done), "Şimdi tekrar gönder" butonu
  - "Tüm temizlikçilere şimdi gönder" butonu (manuel arka kapı)
  - Gönderilen mesajların önizlemesi (modal): şablon + örnek link
- Cleaner için chat YOK. WhatsApp mesajı varsayımı: kısa link `clock.$token` mevcut sayfaya yönlenir (zaten var). Numaralı cevap simülasyonu admin panelinden test edilebilir.

### 6. WhatsApp şablonu (simülasyon metni)
```
Günaydın {ad}! Bugün {N} oda temizliğin var:

1. {Pansiyon} - Oda {no}  → {link}
2. {Pansiyon} - Oda {no}  → {link}
...

Başlatmak için oda numarasından önce "1 ", bitirmek için "2 " yaz.
Örn: "1 3" = 3. odayı başlat.
```

### Teknik notlar
- Mevcut `clock.$token` rotası ve `time_entries` mantığı korunur — link tıklama yolu zaten çalışıyor.
- Numaralı cevap → `simulateReply` → cleaner'ın o gün gönderilen `dispatch_messages.task_ids[index-1]` görevini bulur, `time_entries`'a clock_in/clock_out yazar.
- Yeni tablolarda `service_role` + role bazlı RLS (admin/owner full, cleaner sadece kendi `dispatch_messages` SELECT).
- Cron noktasında `dispatch.morning_time` HH:MM Europe/Istanbul → UTC karşılaştırması SQL `now() AT TIME ZONE` ile.

### Bu adımda kapsam dışı
- Gerçek Twilio/Meta WhatsApp entegrasyonu (sağlayıcı seçildiğinde tek dosya değişikliği: `provider` alanı ve `sendViaProvider()` helper).
- Mola (`break`) WhatsApp cevabı — şimdilik sadece start/end. Mola hala link üzerinden mevcut clock sayfasından yapılır.
