# Roadmap — Aktuelle Runde (05.10.2026)

## Excel-Abgleich (28.10.2026)
- [x] Aufenthalt verlängern mit Verlauf, Übernachtungen-Statistik (Zimmer-/Personennächte, CSV), Personenzahl-fehlt-Hinweis, Kalender Rechtsklick-Scrollen und Fokus nach Fensterwechsel; Zahlungen heißt auf Deutsch Buchhaltung.
- [ ] Demo-Daten löschen und 1.009 Buchungen importieren: wartet auf erneute Datei vom Nutzer.

## Hostinger canlı kullanıcı işlemleri (28.10.2026)
- [x] datensoft.com bağımsız Hostinger yayını doğrulandı; görünen eksik sunucu anahtarı hatası e-posta çakışmasından önce oluşuyor. Ekleme/silme/engelleme/yönetici ve şef şifre yenileme aynı ayrıcalıklı bağlantıya bağlı; güvenlik kısıtları değiştirilmedi. 39 dosyada 255 test ve gerçek sahip hesabıyla önizlemede 11 ekran açılışı geçti, çalışma hatası yok; kullanıcılar silinmedi.
- [ ] Hostinger canlı sunucu ayarını düzeltme ve gerçek kullanıcı ekleme/silmesini yeniden doğrulama: Hostinger yönetim bağlantısı yok, canlı tarayıcı erişimi güvenlik kontrolünde kalıyor; önizleme bağlantı yenilemesi Hostinger'a aktarılmaz. Canlı sunucu ayarları erişimi/gizli değerleri kapalı ekran görüntüsü bekleniyor; tüm canlı sistem doğrulandı sayılmadı.

## TV sayaç incelemesi (28.10.2026)
- [x] Günlük sayaç rozetleri kaldırıldı; yalnız doluluk yüzde puan ve hazır oda adedi değişimleri 8 saniye gösteriliyor; ilk yükleme/gün değişimi/reconnect sessiz, fiziksel doluluk kuralı korundu.
- [x] Sağ alan mevcut temizlik gereken/kullanıma kapalı oda sayılarıyla dolduruldu, yeni rezervasyon kutlaması korundu. 44 test ve derleme geçti; gerçek sahip hesabıyla geçici TV bağlantısında 206 oda / 8 dolu / 191 hazır / 4 temizlik / 3 kapalı doğrulandı; dört ekran boyutunda yatay taşma veya çalışma hatası yok. Kontrol bağlantısı iptal edildi; işletme kayıtları değişmedi. Telefonda yoğun lokasyon tablosunun mevcut küçük satırları bu kapsamda yeniden tasarlanmadı.

## Sabah görev özeti (28.10.2026)
- [x] Bugünkü/geciken atanmış yapılacaklar ve temizlik işleri Almanya saatiyle 08.00’de, bildirim izni olan aktif çalışanlara firma kapsamlı ve günde bir kez özetleniyor; görev yoksa gönderilmiyor.
- [x] 20 test, DST, izinsiz/yanlış anahtar 401 ve derleme doğrulandı. Toplu görev özeti çalışan hesaplarına kapalı.
- [ ] Gerçek telefon teslimatı: telefon bildirim bağlantısında web bildirimi seçeneği ve en az bir çalışanın izin vermesi bekleniyor; şu an kayıtlı cihaz yok.

## Project monitoring (28.10.2026)
- [x] Oda bulgusu güncelliğini yitirmiş: organization_id okuma izni zaten mevcut; sahip oturumuyla genel oda listesi ve lokasyon oda görünümü HTTP 200 ile açıldı. Gereksiz izin/kod değişikliği yapılmadı.
- [x] Bölüm çalışanının hızlı görev eklemesi kendine varsayılan atamayla düzeltildi; sıfırlama ve bölüm değişiminde aynı kural korunuyor, şef/büro seçenekleri değişmedi. 16 test ve hatasız derleme; Bakım 1 test hesabıyla Enter üzerinden iki kayıt, yenileme sonrası görünürlük ve arşivleme doğrulandı. İşletme kayıtları ve sunucu yetkileri değiştirilmedi.

## Program adı ve güvenlik araştırması (26.10.2026)
- [x] Görünen adlar, sayfa başlıkları, üç dildeki metinler, TV başlığı ve rapor dosya adları Pension Highway oldu; adresler, kayıtlar ve tarayıcı tercihleri korundu. Animasyon eklenmedi. Oturumlu panel/rezervasyon ve girişsiz TV açılışı doğrulandı; 74 mevcut test geçti.
- [x] Cloudflare resmi kaynakları incelendi: VibeSDK/Code Mode genel kod denetleyicisi değil; API Shield Vulnerability Scanner farklı kapsamda. Bu tur Cloudflare taraması yapılmadı; Lovable hızlı/derin taraması ve ayrı sızma testi seçenekleri açıklandı.

## Panel ve Eylem Merkezi mobil taşma (24.10.2026)
- [x] Kayıt ayrımı: Panel ve Eylem Merkezi listelerine belirgin ayırıcı çizgiler ve kayıt boşluğu; Panel görevlerinde ayrı mavi oda satırı, Eylem Merkezi'nde dönüşümlü hafif satır tonu eklendi. Gerçek sahip hesabında 390px telefon açık/koyu görünümü doğrulandı; altı görev görünür, yatay taşma ve çalışma hatası yok, derleme geçti. Veriler değişmedi.
- [x] Uzun lokasyon adlarıyla gerçek hesapta sağa taşma yeniden üretildi ve giderildi; tek sütunda sıfır tabanlı genişlik ve mobilde alt alta kayıt/durum düzeni uygulandı. Tam lokasyon adları okunabilir satırlara bölündü, kayıtlar değişmedi. TR/DE/EN ve 320/390/430/768/1280px ile 30 oturumlu ekran kontrolünde taşma/yatay kaydırma ve çalışma hatası yok; ekran görüntüleri ve derleme doğrulandı.

## Hostinger paket uyarıları (23.10.2026)
- [x] Görseldeki aktif Zod/esbuild uyarıları giderildi: Zod 4.6.6, doğrudan Standard Schema ve esbuild 0.25.12; 225 test, derleme, esbuild dönüşüm/drizzle sürüm kontrolü ve sahip oturumuyla rapor (hatalı filtre dahil)/TV yönetimi açılışı geçti. Yeniden taramada Zod bulgusu yok. GHSA-gv7w-rqvm-qjhr 17.06.2026 tarihinde geri çekilmiş; başka paket bulguları bu tur kapsam dışı.
- [ ] Hostinger doğrulaması: güncel sürümün yeniden yüklenmesi ve Hostinger taramasının yenilenmesi kullanıcı erişimi gerektiriyor; geri çekilmiş iki esbuild uyarısı tarayıcıda hâlâ listelenebilir.

## Giriş geri bildirimi ve yerleşim (23.10.2026)
- [x] Bekleme sayfa geçişi tamamlanana kadar sürer; bağlantı/şifre hataları formda gösterilir; şifre göster/gizle, dengeli büyük ekran ve beyaz giriş kartı. 1920/2560 ve 390px ekran, gecikmeli/yanlış şifre/bağlantı hata denemesi ve gerçek Büro test hesabıyla / sayfasına giriş doğrulandı; derleme geçti. Yetki ve veri kuralları değiştirilmedi.

## Müşteri geçmişi ve sade mesai (23.10.2026)
- [x] Misafirler ve Firmalar: kalıcı kişi/firma kartları, açık rezervasyon/ödeyen/konaklayan ilişkileri, belirsiz eski kayıtların onaylı eşleştirilmesi; filtreli geçmiş ve yetkili mali görünüm/çıktı. Test müşteri kartı oluşturuldu, rezervasyon kaydedildi ve geçmişten tekrar açıldı; test rezervasyonu çöp kutusuna taşındı, açıkça adlandırılmış müşteri kartı/audit geçmişi kaldı.
- [x] Zaman Takibi: boş başlangıç, aranabilir kişi seçimi, tek dönem, kayıt bulunan günlük liste ve küçük özet; sade fazla mesai ve kapalı detay/düzenleme işlemleri; ana ekrandan ücret/ödeme/eşik kontrolleri kaldırıldı. Test Bakım 1 hastalık kaydı liste/özetinde doğrulandı ve gerekçeli iptal edildi; fazla mesai açılışı doğrulandı.
- [x] İki alanın 223 kural testi ve 24 üç dil/açık-koyu/bilgisayar-telefon açılışı/taşma kontrolü geçti; son derleme hatasız. Müşteri kayıt+rezervasyon ve hastalık kayıt+iptal sahip oturumuyla uçtan uca doğrulandı.
- [ ] Müşteri şirket/konaklayan ayrımı, yeni kart atomik geri alma ve tenant SQL: supabase/tests/customer_history.sql ve tenant_isolation.sql mevcut SQL hesabının fonksiyon/tablo-sahipliği yetkisinde durdu; güvenlik gevşetilmedi. Şef/İK ücret/onay ve ayrı firma hesaplarıyla bu yeni ekranlara özgü canlı doğrulama henüz yapılmadı.
- [ ] Kullanıcının belirttiği sonraki aşama: diğer ekranlarda gereksiz/karmaşık kontrollerin sadeleştirme incelemesi; ilk iki alanın ardından ayrı turda ele alınacak, bu tur genel ekranlar değiştirilmedi.

## Kalan işleri tamamlama (23.10.2026)
- [x] Son paylaşım öncesi inceleme: 52 bilgisayar/telefon sayfa açılışı + 6 koyu telefon ekranı ve 212 test geçti; arama/CSV/form/sekme/telefon menüsü/kamerasız QR kontrol edildi. Salt-okunur hata simülasyonunda panel sahte sıfırları, görevlerde sahte boşluk ve rol hatasında erişim istemeye yönlendirme doğrulandı. AI gizlilik/müsaitlik ve tahsilat tekrar kurtarma riskleri kaynak incelemesinde bulundu, canlı yazma yapılmadı. Misafir contact eksikliği iddiası canlı fonksiyonla çürütüldü. Rapor: Files/Pensify-son-inceleme-2026-10-23.md; düzeltme/yayın yapılmadı, TV ve işletme kayıtları korundu.
- [x] 23.10 06:50 dil/tema taraması: ekip, rezervasyon pencereleri/çöp kutusu, analiz, kanal/WuBook, erişim isteği, konum testi ve ortak menü/pencere metinleri üç dile bağlandı; tarih/sayı yereli ve koyu görünüm kontrastı düzeltildi. Sahip oturumunda 26 ekran × 3 dil × 2 tema = 156 açılış/taşma/eksik anahtar kontrolü geçti; üç dilde çalışan penceresi, takvim Bugün düğmesi, bağlantı/kontrol sekmeleri ayrıca doğrulandı. 67 mevcut test ve son derleme geçti; TV Almanca/açık düzeni ve işletme verileri korundu. Fiziksel konum, dış hizmet mesajları ve diğer hesaplara özgü gizli durumlar bu turda doğrulanmadı.
- [x] 23.10 06:45 madde bazlı inceleme/rapor: 11 başlık güncel kodla kontrol edildi; 34 dosyada 212 test, 14 sahip ekranı/5 telefon taşma kontrolü geçti. Misafir kayıt ağ hatası kilidi düzeltildi ve ağa çıkmadan engellenen iki yeniden deneme doğrulandı. Saatlik job kurulumu ve 4 başarı, dar secret/TV grant kontrolleri doğrulandı. Tam canlı kabul açık; ayrıntılı kalanlar docs/remaining-scope-review.md son tablosunda. TV ve işletme kayıtları korundu.
- [ ] 23.10 02:37 talebi: 11 aşamayı soru sormadan sırayla uygula, her aşamada ilgili test/tarayıcı kontrolü; çalışan özellikler/TV korunur, dış bağlantılar kendiliğinden açılmaz. Gerçek engeller tamamlandı sayılmaz.
- [x] Öncelik TV listesi: iptal edilmiş geçici bağlantılar veritabanı sorgusunda dışlanıyor; iptal sonrası anında/diğer oturumda 30sn yenilenir. İptal geçmişi ve TV görünümü korundu. 1 kural testi, gerçek sahip hesabında geçici başlığın yokluğu ve aktif filtre isteği doğrulandı.
- [x] Yeni 11 aşamalı belge güncel e449004 kod/migration kanıtıyla yeniden karşılaştırıldı: docs/remaining-scope-review.md. Eski tamamlandı işaretleri tek başına kanıt sayılmadı; 3–11 kısmi/eksik işleri aşağıda korunuyor.
- [x] Yeni kalan kapsam 1 uygulama: Yapılan İşler firma sahibine özel; finans görüntüleme/tahsilat/düzeltme/plan/banka izinleri ayrı, menü ve sunucu firma/lokasyon kapsamlı. Gerekçeli ters kayıt geçmişi silmez; plan editörü IBAN'ı dar yetkili yoldan kaydeder. 28 kural testi ve 10 salt-okunur DB güvenlik doğrulaması geçti; gerçek sahip hesabıyla rapor/tahsilat/plan penceresi/banka/ekip ekranları açıldı, hata yok. TV değişmedi.
- [ ] Kapsam 1 canlı delegasyon/ters kayıt ve tenant/department SQL testleri: ayrı yetkili test ortamı ve uygun ödeme kaydı bekliyor; mevcut SQL oturumu organization_members tablo sahibi değil. Gerçek işletme verisi test için değiştirilmedi.
- [x] Yeni kalan kapsam 2 uygulama: firma/lokasyon yetkili sunucu arama/filtre/sıralama/sayfalama 10/20/30/40/50, tam toplam/CSV, görünür aralıklı 7/14/30 takvim; 300ms debounce ve eski yanıt koruması. 9 kural testi (1234 CSV/DST dahil), gerçek sahip hesabında ad/boş/özel karakter araması, CSV, sıralama, üç dil ve telefon kontrolü geçti; hata yok.
- [ ] Kapsam 2 büyük veri/çoklu rol canlı doğrulaması: mevcut hesapta tek silinmemiş rezervasyon var; ikinci sayfa/1000+ kayıt ve A/B izolasyonu ayrı test verisi/yetkili ortam bekliyor. Üretim verisi test için değiştirilmedi.
- [x] Kapsam 3 uygulandı: gerçek çıkış NULL/inceleme, ayarlı eşikler/son job, Berlin gece/DST çalışma-mola dağılımı; ilgili testler geçti. Fiziksel cihaz/şef canlı testi ayrı engel.
- [x] Kapsam 4 uygulandı: sorun/kontrol ayrımı, lokasyon tercihi, gerekçeli geçmiş ve açıklamasız kategori; 4 kural testi tekrar geçti. Gerçek şef/kontrol kaydı canlı doğrulaması ayrı engel.
- [x] Kapsam 5 uygulandı: mevcut görevlerde atama/ilişkiler/saat/düzenleme/not/geçmiş/özel dosya/tekil tekrar; SQL ve gerçek sahip görev-yazma/PDF-silme/arşiv geçti. Hatırlatma sağlayıcısı bağlı değil; gönderim yapılmadığı gösterilir.
- [x] Kapsam 6 uygulandı: mevcut rezervasyon kaynaklı misafir/firma, sunucu arama/sayfa, finans izinli detay ve iletişim düzenleme; kontaklar birleşmez. SQL düzenleme/yabancı red ve üç dil/telefon/gerçek detay kontrolü geçti.
- [x] Kapsam 7 uygulandı: atomik ödeme/plan, çoklu dağılım, avans/depozito, aynı-payload kalıcı tekrar ID, ilişkisel sayfa/toplam ve sayfalı plan seçimi. SQL tekrar/aşırı ödeme/plan koruma/silme engeli/yabancı red geçti; eşzamanlı oturum ve gerçek tahsilat ayrı engel.
- [x] Kapsam 8 ortak entegrasyon girişi ve gerçek hazırlık/bağlı-değil durumları üç dilde doğrulandı; Sparkasse/WuBook canlı bağlantısı açık dış bağımlılık, gönderim kapalı.
- [x] Kapsam 9 dar metadata/reveal/edit ve sır içermeyen audit; ham tablo okuma kapalı, yabancı reveal reddi SQL testi geçti. Sahip ekranında otomatik sır açılmıyor.
- [ ] Kapsam 10–11 kalan canlı kabul: TV görünümü korundu/32 test; altı ekran üç dil, üç telefon ekranı ve görev yazma kontrolü hatasız. Gerçek TV olayı, fiziksel QR/GPS, A/B-şef hesapları, eşzamanlı tahsilat ve tenant SQL tablo-sahipliği izni bekliyor.
- [x] TV tam ekran yazıları küçültüldü, başlık/sayı/alt yazı sabit aralıklı ortalı grup yapıldı; lokasyonlara tek/çift satır tonu eklendi. Gerçek fullscreen 1920/2560/3840 kontrolünde sekiz kartta çakışma/taşma yok; dönüş/ses/telefon ve 32 TV testi geçti.
- [x] Ortak yazı ailesi/ölçüleri, 700 ağırlığı ve kart/form/pencere hizaları düzeltildi; 9 oturumlu ekran, telefon ve rezervasyon penceresi kontrol edildi. 32 TV testi, beş ekran boyutu, ses/%55/dönüş/çevrimdışı/iptal geçti. Gerçek yeni olay kutlaması üretim kaydı değiştirilmeden denenmedi.
- [x] TV son istek: günlük/alt sayılar doğrulandı, import otomatik sayılmıyor; lokasyonlu gerçek öncelikler, görünür ses yüzdesi; en fazla iki dengeli alanı dolduran lokasyon sayfası ve farklı gradientler. 32 test, gerçek girişsiz bağlantıyla 5+5 dönüş, ses/ayar/çevrimdışı/iptal ve beş ekran boyutu geçti. Gerçek yeni olay ve sıfırdan farklı günlük kayıt sınırları aşağıda korunur.
- [x] TV son görsel düzenleme: ortak marka/temizlik/bakım gradientleri, sabit yazı hizaları, kalıcı Live kartı, yumuşak açılış/sayfa geçişi ve kibar üç notalı ses; 24 test ve gerçek bağlantıyla 1366×768, 938×607, Full HD/4K/telefon, ses/çevrimdışı/iptal kontrolleri geçti.
- [x] Onaylı TV belgesi: güçlü dalgalı kartlar ve %84/%16 üst yerleşim, Almanca açık ekran; Full HD/4K/küçük ekran doğrulandı.
- [x] TV: günlük KPI/alt sayılar, tekil rezervasyonlar, fiziksel doluluk ve kaynak/lokasyonlu güvenli olaylar, gerçek öncelikler.
- [x] TV: otomatik lokasyon sayfaları/5–20sn ayar, güvenilir 8sn delta, 5sn kutlama/konfeti ve seviye kontrollü ses; 24 test geçti.
- [x] TV: gerçek anonim bağlantı, Full HD/4K/uzun isim, ses/ayar/iptal, tekrar/reconnect/gün değişimi testleri; docs/tv-acceptance.md veri kaynakları ve sınırları.
- [x] TV tasarımı image-43 referansına göre düzenlendi: ilk kart mavi, diğerleri açık zemin/canlı vurgulu; ekran yüksekliğini dolduran tablo, sağ özetler, alt grafik. 938×607, Full HD/4K, telefon, üç dil ve açık/koyu görünüm kontrol edildi; 5 test, anonim bağlantı/ses/iptal kontrolleri geçti. Bu tur yalnız tasarım.
- [x] TV: önceki durum tonlarında canlı renkler, 2×4 kart, kompakt tablo/sayfalama ve tam genişlikte alt grafik; 938×607, Full HD/4K, üç dil, açık/koyu ve anonim bağlantı kontrolü.
- [x] Son onaylı TV belgesindeki günlük KPI, ödeme alt sayıları, yeni olay kutlaması, öncelikler ve dönüş kapsamı tamamlandı; eski kapsamın detay bağlantıları ve ayrı realtime aboneliği bu son belgede yok, eklenmedi.
- [ ] Gerçek otomatik rezervasyon kutlama kontrolü: sağlayıcının güvenilir oluşturma zamanı mevcut iCal verisinde yok; eski import kutlanmaz. Gerçek sağlayıcı ve uygun olay bekleniyor.
- [ ] Sıfırdan farklı günlük ödeme/iş KPI ve üretim kutlamasının canlı uçtan uca kontrolü: uygun gerçek kayıt yok; test için işletme kaydı değiştirilmedi. Kural testleri geçti.
- [x] Mesai, yetki, ödeme ve Berlin saati: 15 dosyada 76 test geçti.
- [x] Anonim TV: firma kapsamlı iptal edilebilir bağlantı, kişisel verisiz özet, lokasyonlar, anonim olaylar, 7 günlük grafik/vade sayıları; 30 saniyede sunucu görünümüyle yenileme, tekilleştirme/ses/reduced-motion, DE/EN/TR.
- [x] 111 test geçti; gerçek sahip hesabıyla geçici bağlantı oluşturma–girişsiz açma–iptal kontrolü, 10 lokasyon/84 oda, üç dil, telefon taşma, çevrimdışı uyarı ve yeniden bağlanma doğrulandı. Ham display kayıtları/izinsiz oluşturma/geçersiz token engelli; TV kimliği Mesai Takibi'ne giriş sağlamıyor. Deneme bağlantıları iptal edildi.
- [ ] Ayrıcalıklı TV/tenant SQL bütünleşme kontrolleri: salt okunur test oturumu ve fonksiyon izni engeli; gerçek veriler değiştirilmedi. Girişsiz gerçek API güvenlik kontrolleri geçti.
- [ ] Fiziksel QR/GPS ve gerçek şef/fazla mesai/ödeme kayıtlarıyla deneme: fiziksel cihaz ve uygun kayıtlar bekliyor; gerçek işletme verileri test amacıyla değiştirilmeyecek.
- [ ] Genel görev e-posta/push hatırlatması: teslimat sağlayıcısı bağlı değil; mevcut ekran doğru biçimde gönderim yapılmadığını gösterir.
- [ ] Sparkasse ve WuBook: dış sağlayıcı erişimi ve Booking.com otel kimliği/canlı geçiş onayı bekliyor; gönderim kapalı tutulacak.

## Kapsam belgesi (22.10.2026) — 8 aşama
- [x] Yapılan İşler Yönetim'e taşındı; varsayılan sahip/admin, şef/İK için rapor yetkisi kapalı başlar ve ayrıca açılır. 18 test geçti; sahip ekranı ve uygulanan yetki kuralı doğrulandı. Diğer hesaplarla canlı/SQL güvenlik kontrolü mevcut ayrıcalık engelini bekliyor.
- [x] Ödeme planını yeniden oluşturma: ödeme geçmişi olan aylar korunur, kalan toplam yeniden bölünür; 22 ödeme/banka testi geçti, oturumlu pencere kontrol edildi.
- [ ] Ödeme planını gerçek kayıtla yeniden oluşturma kontrolü: mevcut hesapta taksit ve uygun uzun konaklama kaydı yok.
- [x] Temizlik şefi ataması: bölüm/aktif çalışan/firma/lokasyon kontrolü, RPC ve doğrudan yazma koruması; 4 test geçti. Yönetici ekranı kontrol edildi; şef hesabı ve SQL izolasyon testleri ayrıcalıklı test erişimi bekliyor.
- [x] Bakım ataması: ayrı Bakım ekranı, yetkili aktif bölüm çalışanları, atayan kişi/zaman, doğrudan yazma koruması; 17 test geçti, boş ekran ve mobil kontrol edildi.
- [ ] Bakım şefi gerçek atama testi: henüz bakım çalışanı/şefi ve açık bakım işi yok; SQL firma/bölüm testleri ayrıcalıklı erişim bekliyor.
- [x] Bölüm raporu erişimi: şefin açık rapor yetkisiyle kendi bölümü ve erişebildiği lokasyonlar; sahip/admin tümü, İK ayrıca verilen rapor yetkisiyle tümü; toplam/detay/CSV aynı kapsamda.
- [ ] Bölüm raporu şef hesabıyla uçtan uca test ve SQL güvenlik testleri: atanmış şef hesabı yok; department_report.sql ve tenant_isolation.sql çalıştırılması sandbox tablo sahipliği izninde durdu, deneme kayıtları geri alındı.
- [x] 1. Mesai akışı: çalışan yalnız kendi açık mesaisini görür; şef gerekçeli düzeltir, geçmiş kaydı tutulur; çift tıklama/çakışan mesai engelli; unutulan çıkış sıfır süreyle kontrole düşer; temizlik bitirmek mesaiyi kapatmaz. Farklı rol ile canlı erişim testi sandbox rol kısıtı nedeniyle yapılamadı.
- [x] 2. Rezervasyon listesi sunucu sayfalama + takvim aralığı/görünümleri
- [x] 3. Genel görevler modülü
- [x] 4. Temizlik: Bekliyor→Kabul→Başladı→Bitti (+Sorun) akışı; açıklamalı sorun bildirimi, açık sorun listesi ve "Çözüldü" (kim/ne zaman kayıtlı)
- [x] 5. Aylık ödeme planı ve tahsilat (planlar, kısmi ödeme, banka ayarları + hareketler sayfası; gerçek Sparkasse bağlantısı için lisanslı sağlayıcı sözleşmesi bekliyor)
- [x] 6. "Bugün oluşturulan rezervasyonlar" sayacı panele eklendi; tıklanınca rezervasyon listesi "Bugün oluşturulan" filtresiyle açılıyor. Tarayıcıda doğrulandı.
- [x] Yönetim → Yapılan İşler: yalnız sahip; dönem/lokasyon filtreli toplu özet, lokasyon tablosu, günlük grafik, tıklanabilir detay listesi, personel görünümü, CSV. 7 test + tarayıcı kontrolü.
- [x] 7. Menü gruplama: Günlük İşler / Konaklama / Operasyon / Finans / Yönetim / Araçlar; AI Asistan ve Kanal Senkron ikincil "Araçlar" grubunda; DE/EN/TR grup adları.

- [x] Yapılan İşler: Tümü/Temizlik/Büro/Bakım sekmeleri; konuya göre özet, grafik, kişiler, detay ve CSV; bakımda bildiren/çözen ayrı. 12 test ve oturumlu tarayıcı kontrolü geçti.
- [x] Yapılan İşler: tüm görünümlerde dönem/lokasyona göre sabit renkli toplamlar; Genel toplamlar/İş kayıtları/Kim yaptı ayrımı; atanmamış işler açık etiketli, kişi kimlikleri ortak kullanıcıya bağlı.
- [x] 8. Anonim TV ekranı: Araçlar → TV ekranları; yalnız sahip/admin bağlantı oluşturur/iptal eder, TV kimliği yalnız firma kapsamlı anonim özet okur. 111 test ve gerçek bağlantı akışı doğrulandı; ayrıcalıklı SQL testleri erişim engeline takıldı.

- [x] Temizlik tamamlandığında Genel Bakış hemen yenileniyor; 6 test geçti. Giriş yapılmış ekranda geri alınan tamamlanmış görev yeniden bitirildi: müsait 75→76, sarı 6→5; toplam 84 korundu.

- [x] Dört renkli panel kartı toplam 84 odayı kapsıyor: 3 dolu + 78 müsait + 3 temizlik + 0 bakım. Sarı bekleyen/devam eden temizliği birleştiriyor, dolu ana değer oda sayısı; 4 test ve giriş yapılmış ekran kontrolü geçti.

- [x] Panel/Odalar sayı farkı: silinmiş rezervasyonlar dışlandı, ortak oda durum kaynağı kullanılıyor; belirsiz görev alt sayısı kaldırıldı. 12 test geçti; giriş yapılmış ekranda her ikisi 3 dolu, 78 müsait, 2 temizlik bekleyen ve 1 temizlenen oda olarak doğrulandı.

- [x] Görev Dağıtım'ın yalnız günlük özet olduğu, görev atamalarının Temizlik'te yapıldığı ve WhatsApp'ın bağlı olmadığı açıklandı; mesajlar deneme olarak etiketlendi. Saat gösterimleri ve otomatik görev zamanlaması Berlin'e sabitlendi, kayıtlı İstanbul ayarı düzeltildi; 11 test ve İstanbul saatindeki cihazla giriş yapılmış ekran/Temizlik geçişi kontrol edildi. Dolu gün ve gerçek mesaj gönderimi doğrulanmadı.

- [x] Günlük renkli liste, yazdırma/CSV çıktısı; ücretler yalnız detayda; 31 günlük liste ve mobil taşma kontrol edildi
- [x] Kullanıcı ekleme Ekip'te; temizlikçi görünümü role bağlı, profil otomatik; Manager şef görünümü; ana roller korunur, silmede iki kez isim onayı, personel pasifleştirme kayıtları korur
- [x] Çalışan bazlı çalışma günleri ve hastalık/izin kaydı; aylık raporda saatlerden ayrı gösterim, 7 hesap testi ve kayıt/yeniden açma/iptal kontrolü
- [ ] Çalışan kayıtları + tenant SQL güvenlik testleri: sandbox rolü tablo sahibi değil ve authenticated rolüne geçemiyor; rol otomasyon testi de organization_members güncelleme izninde durdu, deneme değişiklikleri geri alındı
- [x] Menülerin onaylı mavi tasarımla uyumunu kontrol et; açık/koyu menü vurguları mavi

- [x] Buchung löschen → Papierkorb (nur Admin sieht, Wiederherstellen/Endgültig löschen, wer/wann/Grund)
- [x] Schlüsselbox-Code pro Zimmer
- [x] Dashboard: modernes Design, Glow/Animation, Zahlen anklickbar, Belegung aus heutigen Buchungen
- [x] Kanal-Farben: ganze Buchungszeile eingefärbt; Datum TT.MM.JJJJ in Buchungen/Dashboard
- [ ] Pilot Bünde Borriestr.: WuBook-Unterkunft 1791196170 + Einzelzimmer (ID 753351, Anzahl 1, €49) angelegt und geprüft — wartet auf Booking.com Hotel-ID; Sync noch aus
- [x] Zeiterfassung: Büro-QR (Geofence) + Außendienst Auto-Clock-in beim ersten Reinigungsstart (clock_start_for_task, GPS-Prüfung, einmal pro Tag; Checkout weiterhin manuell/QR)
- [ ] Login ohne Registrierung/Google, neues Design
- [x] Buchungsformular Privat/Firma (Neu + Bearbeiten)
- [x] Wartung → neue/bearbeitete Buchungsauswahl filtert Wartung/inaktiv/belegte Zeiträume; DB-Sperre + property-scoped Outbox; 20 Tests und angemeldeter Browser-Test erfolgreich; WuBook-Sync bleibt aus
- [ ] Wartung SQL-Integrationstest: supabase/tests/maintenance_rooms.sql wartet auf privilegierten Testzugriff (sandbox kann rooms nicht ändern); echte WuBook-Sperrübertragung wartet auf freigegebenen Live-Sync
- [x] Reinigung: vollständige Vor-/Zurück-Statuswechsel für berechtigte Leitung; Zimmerstatus folgt automatisch
- [x] Zimmerübersicht: kompakte Liste, globale Suche/Filter, sichere Schlüsselcode-Anzeige, responsive Dialoge
- [ ] Dispatch/Team Komplett-Test, restliche i18n-Durchsicht außerhalb Zimmer/Reinigung

- [x] Tesisler: kartların gereksiz iç boşlukları kaldırıldı, mavi tasarım uygulandı; 10 kart, oda detay bağlantısı ve mobil taşma kontrol edildi. Kullanım akışları sonrasında birlikte incelenecek.
- [x] Kanal senkron: mavi tasarım, sade genel bakış; bağlantı/pilot, testler ve geçmiş ayrı sekmelerde. Giriş yapılmış hesapta sekmeler ve mobil taşma kontrol edildi; mevcut yetkiler ve kapalı canlı gönderim korundu. Yalnız sahibin erişimi daha sonra ele alınacak.
- [x] Görev Dağıtım: mavi özetler, açılabilir çalışan listesi, görev listesinde altı kayıt sınırı kaldırıldı; DE/EN/TR metinler. Giriş yapılmış hesapta satır açma, Temizlik bağlantısı ve telefon görünümü kontrol edildi; gönderim kuralları değişmedi.
- [x] Görev Dağıtım menüden kaldırıldı (atama Temizlik ekranında; WhatsApp bağlanınca geri gelebilir)
- [x] Genel Bakış "Müsait" temizlik bekleyen odaları saymıyor
- [x] Kanal Senkron yalnız sahibe açık
- [x] Zaman Takibi + Analitik mavi özet kartları
- [x] Ayarlar, Bildirimler, AI Asistan, Profil mavi tasarım
- [x] Uçtan uca kullanım akışı testi (rezervasyon → takvim → temizlik)

## Mesai (QR) akışı
- [x] Mesaim: tıklamayla kamera, sunucuda QR doğrulama ve yerel lokasyon ekranına geçiş; DE/EN/TR. Kamera yok/kapama ve telefon taşma kontrolü geçti; fiziksel kamera ve gerçek QR okutma bekliyor.
- [x] Personel: Temizlik/Bakım/Büro sekmeleri; üst Mesaim kısayolu kaldırıldı; DE/EN/TR metinler, 8 test, oturumlu sekme/telefon kontrolü ve derleme geçti. Bakım/Büro boş; gerçek bölüm personeliyle isim doğrulaması henüz yapılamadı.
- [x] Mesaim: ortak menü ve üç dilde geri bağlantısı; oturumlu masaüstü menü, /cleaners geri dönüşü ve telefon menüsü doğrulandı; 8 test ve derleme geçti.
- [x] Tüm çalışanların Mesaim bağlantısı: bölümün Çalışan atamasıyla otomatik mesai profili; ana rol ve temizlik ekibi kapsamı korunur. Çalışan olmayanlara açıklama/yönlendirme, DE/EN/TR; 19 test ve gerçek sahip hesabında önce yönlendirme, sonra İK çalışanı ekranı doğrulandı.
- [ ] Mesai başla/mola/bitir canlı QR ve SQL otomasyon/izolasyon doğrulaması: gerçek lokasyonda QR akışı henüz yapılmadı; SQL testleri sandbox tablo sahipliği ve fonksiyon çalıştırma yetkisinde durdu (işlemler geri alındı).
- [x] Mesaim menüsü: üstte doğrudan bağlantı, dar/geniş ekranda erişim ve DE/EN/TR çevirileri; üç dilde bağlantı açıldı.
- [x] Fazla mesai: kapsamlı şef onayı, kişiye özel saatlik ücret, ayrı süre/tutar; 18 hesap/erişim testi ve ekran kontrolü.
- [ ] Fazla mesai gerçek onay/ödeme ve firma izolasyon testi: tamamlanmış mesai/şef hesabı ve ayrıcalıklı SQL test erişimi bekliyor.
- [x] Aşama 1: Sade çalışan ekranı (QR + Mesaim), ayrı mola aralıkları, tekrar basmaya dayanıklı mola/devam, girişten sonra QR'a dönüş
- [x] Aşama 2: Mesai Takibi ilk görünümünde aylık günlük liste; gün durumu/oturum/mola/net, açılır lokasyon ve mola aralıkları. İnceleme kayıtları net toplamdan çıkarıldı; bakım/büro mola RPC'leri mesai uygunluğuna bağlandı. 30 test geçti; gerçek hesapta aylık liste ve telefon kamera durumu doğrulandı.
- [ ] Gün detayı gerçek oturum/mola ve fiziksel QR testi: mevcut dönemde mesai kaydı yok; test ortamında fiziksel kamera yok. Şef/İK kapsamı Aşama 3'te devam edecek.
- [x] Aşama 3: Sunucuda kapsamlı mesai listesi; sahip/admin tümü, İK firma geneli, mesai yetkili şef kendi çalışanları ve erişilen lokasyon oturumları. CSV aynı verilerden günlük oturum/mola/net süre içerir; DE/EN/TR. 21 test, sahip hesabında 31 günlük liste ve CSV indirme geçti.
- [ ] Aşama 3 güvenlik doğrulaması: Gerçek şef/İK hesabıyla kapsam testi bekliyor; attendance_scope.sql ve tenant_isolation.sql tablo sahipliği izninde durdu, işlemler geri alındı.
- [x] Aşama 4: Çıkışta kaydın lokasyonuna göre sunucuda konum kontrolü; yöneticinin konumsuz lokasyon izni korunur. 16 saati aşan unutulan çıkışları sıfır süreyle kontrole ayıran saatlik kontrol aktif (günde 24 çalıştırma; kullanıcı isteğiyle seyrekleştirildi); DE/EN/TR uzun mesai uyarısı, 24 test ve oturumlu Mesaim ekranı kontrolü geçti, derleme temiz.
- [ ] Aşama 4 gerçek çıkış/zamanlayıcı doğrulaması: test çalışanının firmasında koordinatlı lokasyon yok; unutulmuş açık mesai yok; tenant_isolation.sql salt okunur test erişimi nedeniyle çalışmadı. Gerçek lokasyonda QR/GPS çıkışı ve ayrıcalıklı güvenlik testi bekliyor.

## Kullanıcı akışı testleri (2026-10-23)
- [x] Açık listedeki hatalar: bağlantı hatası uyarısı (Panel, Görevler), geçici yetki hatası erişim isteme sayfasına atmıyor, AI isim gizleme kapalı-güvenli, AI bakımdaki/silinmiş kayıtları önermiyor, tahsilat tekrar denemesi güvenli düzeltme, girişten sonra istenen sayfaya dönüş
- [x] 8 test kullanıcısı (temizlik x2 + şef, bakım x2, büro x2, İK), bölümler ve işler
- [x] Bakım çalışanı kendisine atanan arızayı görüp çözebiliyor; personel kendi lokasyon adlarını görebiliyor
- [ ] Gerçek lokasyonda QR/GPS mesai: fiziksel cihaz gerekiyor

- [x] Firma oda listesi (207 oda, 20 lokasyon, 89 anahtar kutusu kodu) yüklendi; eski test kayıtları silindi, demo kayıtları eklendi
- [x] Oda bazında satış kanalları (Booking/Airbnb/Expedia/Web sitesi) ve otomatik/elle takip ayarı

- [ ] Excel import: demo silme, 1009 rezervasyon, gerçek isimli müşteri kayıtları
