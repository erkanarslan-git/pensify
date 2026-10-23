# Roadmap — Aktuelle Runde (05.10.2026)

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
- [ ] 8. Anonim TV ekranı

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
- [x] Mesaim: ortak menü ve üç dilde geri bağlantısı; oturumlu masaüstü menü, /cleaners geri dönüşü ve telefon menüsü doğrulandı; 8 test ve derleme geçti.
- [ ] Mesai personel bağlantısı: bölüm çalışanı ataması sahip/bakım/büro için mesai profili oluşturmuyor; ana rolü değiştirmeden bölüm temelli profil otomasyonu ayrı uygulama bekliyor.
- [x] Mesaim menüsü: üstte doğrudan bağlantı, dar/geniş ekranda erişim ve DE/EN/TR çevirileri; üç dilde bağlantı açıldı.
- [x] Fazla mesai: kapsamlı şef onayı, kişiye özel saatlik ücret, ayrı süre/tutar; 18 hesap/erişim testi ve ekran kontrolü.
- [ ] Fazla mesai gerçek onay/ödeme ve firma izolasyon testi: tamamlanmış mesai/şef hesabı ve ayrıcalıklı SQL test erişimi bekliyor.
- [x] Aşama 1: Sade çalışan ekranı (QR + Mesaim), ayrı mola aralıkları, tekrar basmaya dayanıklı mola/devam, girişten sonra QR'a dönüş
- [ ] Aşama 2: Mesai Takibi'nde personelin bütün günleri (gün durumu, oturum/mola/net, gün detayı)
- [ ] Aşama 3: Şef/İK kapsamlı erişim (sunucu tarafı) + export
- [ ] Aşama 4: Bitirirken konum kontrolü, unutulan çıkış zamanlayıcısı ve uyarı eşikleri
