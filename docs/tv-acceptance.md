# Onaylı TV ekranı — veri ve kontrol raporu

## Veri kaynakları
- **Reservierungen heute:** Berlin gününde oluşturulan kayıtlar, çok odalı rezervasyonlarda ortak rezervasyon kimliğiyle tekilleştirilir. Tümü elle/tümü doğrulanmış otomatik olan gruplar ayrı sayılır; eski import ve karışık köken bilinmeyen gruptadır, otomatik diye sunulmaz. Alt sayılar toplamla doğrulanır. İçe aktarımlar kutlanmaz.
- **Heute gereinigt:** Bugün tamamlanan tekil temizlik işleri; `problem` durumundaki işler ayrıca kontrol bekleyen olarak gösterilir. Ayrı bir kontrol durumu mevcut değildir.
- **Wartungen heute:** Bugün çözülen bakım işleri; açık işler ayrı etiketlenir.
- **Belegung aktuell:** Giriş yapmış konaklamaların fiziksel oda sayısı / aktif oda sayısı. Tarih aralığı doluluğundan farklıdır.
- **Anreisen / Abreisen heute:** Bugünkü planlı konaklama giriş/çıkışları; iptal, gelmedi ve silinmiş kayıtlar dışlanır. Tamamlanan ve beklenen durumlar ayrıca gösterilir.
- **Heute fällige Raten:** Bugün vadeli kira dönemleri; ters çevrilmemiş ödeme toplamıyla ödendi/kısmi/açık ayrımı. Depozito dahil değildir.
- **Bezugsbereit:** Kullanıma uygun ve temiz/temizlenmiş, fiziksel olarak boş oda. Kirli ve bakımda odalar dahil değildir.
- **Öncelikler:** Bugünkü beklenen girişlerin hazır olmayan odaları, bu odaların açık temizlik işleri, bugün ödenmemiş dönemler ve satışa kapalı bu odaların açık bakım işleri. Lokasyon adları ve adetleri açıklamada gösterilir; misafir/oda/personel kimliği yoktur. Ayrı kritik bakım derecesi olmadığı için yapay önem derecesi üretilmez.

## Doğrulananlar
- 23.10 son tur: 32 test geçti; 10 lokasyonun 5+5 olarak en fazla iki sayfaya bölünmesi, 8 lokasyonun 4+4 dağılımı, tek sayılı listelerin korunması ve ödeme/köken toplam uyuşması ayrıca test edildi.
- Gerçek girişsiz TV bağlantısıyla 938×607, 1366×768, Full HD, 4K ve telefon; taşmasız tablo, otomatik/manuel dönüş ve duraklama, ses aç/kapat, %55 seviye, çevrimdışı/sessiz yeniden bağlantı ve iptal doğrulandı; tarayıcı hatası yok. Yeni anonim v3 özet başarıyla okundu. Geçici bağlantılar iptal edildi.
- 24 yardımcı test: ilk yükleme, gün dönüşü, eski/tekrar veri, bağlantı dönüşü, içe aktarım/güncelleme bastırma, tekilleştirme, artış/azalış, 8 saniye delta, 5 saniye bildirim, 5/10/15/20 saniye dönüş sınırları.
- Gerçek sahip hesabıyla ekran bağlantısı oluşturma; girişsiz okuma; dönüş ayarı kaydetme ve anonim görünümde geri okuma; bağlantı iptali.
- Full HD, 4K, 938×607 ve telefon görünümü; Almanca ve açık TV görünümü, ana uygulamanın Türkçe tercihinin korunması.
- Otomatik dönüş, elle sayfa değiştirme, duraklatma; ses etkinleştirme/susturma ve seviye; çevrimdışı uyarı ve sessiz bağlantı dönüşü.
- Anonim yanıtta misafir/personel kimliği, telefon, IBAN, kapı kodu, gelir ve mesai alanları yok.
- Gerçek özet 84 aktif oda; bugün için yeni rezervasyon, tamamlanan temizlik/bakım ve vade kayıtları sıfırdı. Örnek rakamlar eklenmedi.

## Doğrulama sınırları
- Gerçek yeni rezervasyon üzerinden kutlama/ses ve sıfırdan farklı günlük ödeme/iş sayıları üretim verileri değiştirilerek denenmedi. Olay kuralları yardımcı testlerle doğrulandı.
- Ayrıcalıklı kurumlar arası SQL bütünleşme testleri mevcut test erişimi kısıtı nedeniyle tamamlanmış sayılmaz.
- Veri 10 saniyelik güvenli özet okumasıyla yenilenir; özel gerçek zamanlı abonelik eklenmedi.
- Otomatik sağlayıcı rezervasyonlarının kutlanması güvenilir dış oluşturulma zamanının sağlayıcı tarafından kaydedilmesini gerektirir; mevcut eski iCal içe aktarımları bu bilgiyi taşımadığı için kutlanmaz.