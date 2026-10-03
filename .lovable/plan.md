# Odalar ve Oda Tipleri — Sadeleştirme

## Sorunlar
- "Zimmertypen & Preise" penceresi ne işe yaradığını anlatmıyor. Testte oluşturulan "testt" bir **oda tipi** olarak kaydedildi (Pension Bünde — Vinckestr., 2 kişilik, 0,05 €). Gerçek oda oluşmadı, bu yüzden hiçbir listede görünmedi.
- Odalar sayfası 25 odayı tek, karışık bir ızgarada gösteriyor.
- "Bu pansiyonda kaç tane 1/2/3/4 kişilik oda var, kaçı boş" bilgisi hiçbir yerde görünmüyor (Booking.com / Airbnb mantığı).

## Mantık (Booking.com ile aynı)
```text
Pansiyon
 └─ Oda tipi (Einzelzimmer, Doppelzimmer, ...)  -> fiyat + kanallara gönderilen "müsait sayısı"
     └─ Gerçek odalar (#1, #2, #3 ...)          -> temizlik ve takvimde kullanılır
```
- Bir oda tipindeki **müsait sayısı = o tipe bağlı gerçek oda sayısı − o gece rezerve olanlar**. Bu sayı otomatik hesaplanır, elle girilmez. Rezervasyon gelince 5'ten 4'e kendiliğinden düşer, iptal olunca geri çıkar. İleride WuBook'a da bu sayı gönderilecek.

## 1. Pansiyon odaları sayfası (Zimmer verwalten) yeniden düzenlenir
- Üstte **oda tipi kartları**, her biri örneğin: "Doppelzimmer · 2 Pers. · 65 € · 6 Zimmer · heute frei: 4".
- Her kartın altında o tipe ait odalar sade bir liste olarak (no, kat, durum, temizlikçi) yer alır. Tipi olmayan odalar "Ohne Zimmertyp" grubunda görünür.
- Butonlar:
  - **"Zimmertyp anlegen"** — ad, kişi sayısı, gecelik fiyat. Açıklama: "Kategorie für Preis und Buchungsportale – kein echtes Zimmer."
  - Her tip kartında **"+ Zimmer"** — o tipe yeni bir gerçek oda ekler. Kişi sayısı tipten otomatik gelir.
  - **"Mehrere Zimmer anlegen"** — örneğin "6 adet, numara 1–6" diyerek tek seferde birden fazla oda ekler.
  - Tipi olmayan bir odada **"Typ zuweisen"** — mevcut 25 odayı tiplere bağlamak için.
- Eski "Zimmertypen & Preise" açılır penceresi kaldırılır, işlevi bu sayfaya taşınır.

## 2. Genel Odalar sayfası filtrelenir
- Filtreler: **Pansiyon** (açılır liste), **Oda tipi**, **Durum**, **Arama** (oda no).
- Varsayılan görünüm: pansiyonlar kapanıp açılabilen bölümler halinde; her başlıkta "12 Zimmer · 3 frei · 2 Reinigung". Seçilen tek pansiyon açık gelir.
- Kartlar küçültülür; düzenleme ve silme her zaman görünür bir "…" menüsüne taşınır (sadece fareyle üstüne gelince görünmez).

## 3. Test kaydı
- "testt" oda tipi silinmez. Yeni sayfada görünür olacak; dilersen oradan silebilir veya düzenleyebilirsin.

## Teknik notlar
- Müsaitlik: yeni salt-okunur fonksiyon `room_type_availability(property_id, date)`. Bu fonksiyon tipe bağlı aktif odaları sayar ve o gece iptal edilmemiş rezervasyonu olanları çıkarır. SECURITY INVOKER olur, yani mevcut erişim kuralları geçerli kalır. Ek migration ile sadece eklenir.
- Tek seferde birden fazla oda ekleme tarayıcıdan tek bir toplu kayıt isteğiyle yapılır. Mevcut "oda tipi aynı pansiyona ait olmalı" kuralı zaten veritabanında uygulanıyor.
- WuBook'a hiçbir şey gönderilmez. Veri silinmez.
- Metinler Almanca (mevcut i18n dosyalarına eklenir).
