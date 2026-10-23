# Müşteri geçmişi ve sade Zaman Takibi

## 1. Misafirler ve Firmalar
- Menü korunacak; üstte **Kişiler / Firmalar**, arama, lokasyon, konaklama dönemi ve aktif konaklama filtreleri olacak. Bilgisayarda tablo, telefonda sade liste kullanılacak; sayfa boyutları 10/20/30/40/50 kalacak.
- Kişi ve firmalar için kalıcı kartlar oluşturulacak. Aynı ad, telefon veya e-posta kendiliğinden birleştirilmeyecek. Eski, belirsiz kayıtlar **Eşleştirme gerekiyor** olarak gösterilecek; yetkili kişi mevcut karta bağlayabilecek veya ayrı kart oluşturabilecek. Etkilenen konaklamalar onaydan önce gösterilecek ve işlem geçmişi korunacak.
- Rezervasyon formunda mevcut kişi/firma aranıp seçilebilecek; gerekirse formdan ayrılmadan yeni kart eklenebilecek. Birden fazla konaklayan kişi gerektiğinde açılan bölümde düzenlenecek; bilinmeyen isimler için kayıt uydurulmayacak.
- **Ödeyen kişi/firma ile konaklayan kişiler ayrı** tutulacak. Bir kişinin özel konaklaması, daha önce çalıştığı firmanın geçmişine veya borcuna eklenmeyecek.
- Kartlarda ilgili konaklamalar, lokasyonlar, odalar, tarihler ve durumlar görülecek; firma, kişi ve rezervasyon ayrıntıları arasında geçiş yapılabilecek.
- Güncel iletişim karttan düzenlenecek; geçmiş fatura bilgileri ve mali kayıtlar değiştirilmeden korunacak.
- Finans yetkisi olanlar için konaklama bedeli, vadesi gelen borç, tahsilat, kalan, avans ve depozito ayrı gösterilecek. Yetkisiz kişilere bu bilgiler hiç gönderilmeyecek. Filtreli yazdırma ve CSV eklenecek.

## 2. Zaman Takibi
- İlk açılışta yalnız **aranabilir personel seçimi** ve küçük dönem kontrolü olacak; kimse kendiliğinden seçilmeyecek, kişilerin çalışma kayıtları seçimden önce yüklenmeyecek.
- Varsayılan dönem **Bu ay** olacak; önceki/sonraki ay düğmeleri ve isteğe bağlı özel tarih aralığı bulunacak. Sayfadaki tüm bilgiler ve çıktı aynı dönemi kullanacak.
- Kişi seçilince **Normal çalışma / Fazla mesai** görünümü aynı kişi ve dönemle çalışacak. Genel çalışan, toplam saat, kayıt ve ödenmemiş kartları kaldırılacak.
- Normal görünümde yalnız kayıt bulunan günler listelenecek: çalışma, hastalık, izin/devamsızlık ve inceleme gereken kayıtlar. Küçük özet, kişinin kayıtlarından çalışma gününü, hastalık/izin günlerini ve kesinleşmiş net süresini hesaplayacak; aynı günün çalışma ve izin kayıtları birlikte korunacak.
- **Tüm günleri göster** seçeneği boş günleri açacak. Kayıt yokluğu devamsızlık sayılmayacak; çalışma planı olmayan, çalışma beklenen ve planlı çalışma bulunmayan günler ayrılacak. Gelecek günler eksik/devamsız işaretlenmeyecek.
- Liste: **Tarih · Durum · İlk başlangıç · Son bitiş · Mola · Net çalışma · Detay**. Süreler HH:MM olacak; oturumlar arasındaki boşluk çalışma sayılmayacak. Kesinleşmiş, devam eden ve inceleme gereken süreler birbirine karışmayacak.
- Aynı anda yalnız bir günün ayrıntısı açılacak. Yetkili saat düzeltme, izin/hastalık ve çalışma planı işlemleri küçük düğmelerden açılan pencerelerde olacak; mevcut gerekçe ve işlem geçmişi korunacak.
- Ana ekrandaki ücretler, ödeme özeti, ödendi/ödenmemiş kontrolleri ve açık mesai kontrolü eşik ayarları kaldırılacak. **Mevcut veriler ve arka plandaki mesai güvenlik kontrolleri silinmeyecek.** Fazla mesai görünümü yalnız süre ve yetkili onaya odaklanacak; yeni bordro veya finans menüsü yapılmayacak.
- CSV ve yazdırma yalnız seçili kişi/dönem ve görünen günleri kullanacak; mali sütun içermeyecek.

## 3. Kontroller ve ardından diğer ekranlar
- Kişi/firma ayrımı, özel konaklama, aynı isimli farklı kişiler, mali gizlilik, eşleştirme onayı ve kartlar arası geçiş test edilecek.
- Boş başlangıç, kişi seçimi, ortak dönem/çıktı, hastalıkla çakışan çalışma, eksik çıkış, geceyi geçen mesai, molalar ve yaz/kış saati kontrol edilecek.
- Firma, rol ve lokasyon sınırları doğrudan isteklerle sınanacak; DE/EN/TR, açık/koyu görünüm ve telefon kullanımı kontrol edilecek. QR/Mesaim, mevcut rezervasyon, tahsilat ve WuBook akışları korunacak; dış gönderim açılmayacak.
- Önce bu iki alan tamamlanacak. Ardından diğer ekranlar gereksiz kartlar, sürekli açık formlar ve anlaşılmayan kontroller açısından incelenecek; doğrulanan eksikler ve yapılamayan kontroller açıkça ayrılacak.

## Teknik uygulama
- Mevcut müşteri ekranı ve rezervasyon formları geliştirilecek; paralel müşteri veya mesai modülü oluşturulmayacak.
- Kalıcı müşteri kimlikleri ve konaklama ilişkileri eklemeli veritabanı değişiklikleriyle kurulacak. Mevcut rezervasyon/fatura alanları tarihsel bilgiler olarak korunacak; isim veya iletişim üzerinden otomatik birleştirme yapılmayacak.
- Müşteri okuma/yazma işlemleri firma/lokasyon kapsamlı yetkili işlemlerden geçecek; mali alanlar her lokasyonun finans yetkisine göre sunucu tarafında ayrılacak.
- Mesai seçim listesi yalnız yetkili personel adlarını getirecek; çalışma verisi mevcut `employee_attendance_board` üzerinden yalnız seçilen kişi için alınacak. Mevcut Berlin günlük süre ve mola hesapları liste/özet/çıktı tarafından ortak kullanılacak.
- Önbellekler firma, kişi ve dönem kapsamını içerecek. Yetki kuralları değişirse ilgili firma izolasyonu testleri de çalıştırılacak; ortamın engellediği testler geçmiş sayılmayacak.