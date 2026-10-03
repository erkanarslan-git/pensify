# Oda listelerini sadeleştirme ve demo fiyatlandırma

## Amaç
105 odaya büyüdüğünde de kolay taranan bir yapı kurmak; `EZ`, `DZ`, `3BZ`, `BAD` gibi kısaltmaları herkes için anlaşılır göstermek ve geçici fiyatları eklemek.

## Yapılacaklar
- **Lokasyonlar:** Her pansiyon kartına oda tiplerinin renkli, kısa dağılımını ekleyeceğim (ör. `12 Doppelzimmer`, `8 Einzelzimmer`). Kartın mevcut özeti korunacak; uzun tip listeleri taşmadan özetlenecek.
- **Genel Odalar sayfası:** Pansiyon → oda tipi → fiziksel oda sırasını belirginleştireceğim. Pansiyonlar açılıp kapanacak; her oda tipi ayrı renk ve tam adla görünecek. Arama, pansiyon, oda tipi ve durum filtreleri korunacak.
- **Pansiyon oda sayfası:** Fiziksel Odalar sekmesinde uzun satır listesi yerine oda tipi başlıkları altında kompakt oda kutuları kullanılacak. Kutuda tam oda tipi adı, oda kodu, kapasite ve durum görülecek; düzenleme/silme kontrolleri korunacak.
- **Kısaltma açıklamaları:** `EZ = Einzelzimmer`, `DZ = Doppelzimmer`, `3BZ = Dreibettzimmer`, `4BZ = Vierbettzimmer`, `BAD = eigenes Bad`, `DU = eigene Dusche`, `FZ = Familienzimmer`, `FEWO = Ferienwohnung` açıklamaları görünür bir anahtar ve gerekli yerlerde bilgi balonu olarak sunulacak.
- **Ayırt edici renkler:** Oda tiplerine sabit semantik renkler atanacak; aynı tip uygulamanın farklı oda ekranlarında aynı renkte kalacak. Renk tek başına anlam taşımayacak, tam isim ve kapasite her zaman yazacak.
- **Demo fiyatlar:** Mevcut oda tiplerine kapasite ve donanıma göre makul geçici temel gecelik fiyatlar eklenecek. Bunlar yalnız Pensify içinde örnek fiyat olacak; gerçek fiyat listesi geldiğinde topluca değiştirilebilir.
- **WuBook güvenliği:** WuBook/OTA çağrısı yapılmayacak. Demo fiyatların dışarı gönderilmemesi için mevcut shadow/dış gönderim kapalı durumu korunacak ve gönderim kuyruğuna istemeden kayıt düşmediği kontrol edilecek.
- **Kontrol:** Masaüstü ve dar ekranlarda Lokasyonlar, genel Odalar ve bir pansiyonun oda sayfası gerçek verilerle açılıp görsel olarak doğrulanacak; yapı ve çalışma hataları kontrol edilecek.

## Demo fiyat kuralı
- Einzelzimmer: 49 €
- Doppelzimmer: 69 €
- Dreibettzimmer: 89 €
- Vierbettzimmer / Familienzimmer: 109 €
- Ferienwohnung: 129 €
- Özel banyo: +10 €, özel duş: +5 €

Bu fiyatlar geçicidir ve WuBook'a gönderilmeyecektir.
