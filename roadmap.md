# Roadmap — Aktuelle Runde (05.10.2026)

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
