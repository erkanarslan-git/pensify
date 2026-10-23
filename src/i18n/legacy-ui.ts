import i18n from "i18next";

// Exact legacy labels are kept only as lookup identifiers, never as fallback UI copy.
const entries = {
  close: ["Schließen", "Close", "Kapat"],
  properties: ["{{count}} Pensionen", "{{count}} locations", "{{count}} lokasyon"],
  pagination: ["Seitennavigation", "Pagination", "Sayfa gezintisi"],
  previous: ["Zurück", "Previous", "Önceki"],
  next: ["Weiter", "Next", "Sonraki"],
  more: ["Mehr", "More", "Daha fazla"],
  morePages: ["Weitere Seiten", "More pages", "Diğer sayfalar"],
  breadcrumb: ["Navigationspfad", "Breadcrumb", "Sayfa yolu"],
  toggleSidebar: ["Menü ein-/ausblenden", "Toggle sidebar", "Menüyü aç/kapat"],
  carousel: ["Bilderfolge", "Carousel", "Görsel dizisi"],
  slide: ["Folie", "Slide", "Görsel"],
  previousSlide: ["Vorherige Folie", "Previous slide", "Önceki görsel"],
  nextSlide: ["Nächste Folie", "Next slide", "Sonraki görsel"],
  play: ["Abspielen", "Play", "Oynat"],
  pause: ["Pausieren", "Pause", "Duraklat"],
  addressPlaceholder: ["Straße, PLZ, Ort", "Street, postal code, city", "Sokak, posta kodu, şehir"],
  recordMissing: ["Datensatz nicht gefunden", "Record not found", "Kayıt bulunamadı"],
  recordFailed: ["Diese Buchung konnte nicht geladen werden. Der Zugriff fehlt oder der Datensatz wurde gelöscht.", "This booking could not be loaded. Access may be restricted or the record deleted.", "Bu rezervasyon yüklenemedi. Yetkiniz olmayabilir veya kayıt silinmiş olabilir."],
  noPermission: ["Keine Berechtigung", "No permission", "Yetkiniz yok"],
  pastRestricted: ["Vergangene Buchung — Bearbeitung nur mit entsprechender Berechtigung. Ansicht ist schreibgeschützt.", "Past booking — editing requires permission. This view is read-only.", "Geçmiş rezervasyon — düzenleme yetkisi gerekir. Bu görünüm salt okunurdur."],
  updated: ["Buchung aktualisiert", "Booking updated", "Rezervasyon güncellendi"],
  updateFailed: ["Aktualisierung fehlgeschlagen", "Update failed", "Güncellenemedi"],
  editReservation: ["Buchung bearbeiten", "Edit booking", "Rezervasyonu düzenle"],
  createdBy: ["Erstellt von", "Created by", "Oluşturan"],
  historyEmpty: ["Keine Einträge oder keine Berechtigung zum Anzeigen.", "No entries or no permission to view them.", "Kayıt yok ya da görüntüleme yetkiniz yok."],
  restoreConflict: ["Wiederherstellen nicht möglich: Zimmer ist in diesem Zeitraum belegt.", "Cannot restore: the room is occupied during this period.", "Geri yüklenemedi: oda bu tarihlerde dolu."],
  purgeConfirm: ["Endgültig löschen? Das kann nicht rückgängig gemacht werden.", "Delete permanently? This cannot be undone.", "Kalıcı olarak silinsin mi? Bu işlem geri alınamaz."],
  restored: ["Buchung wiederhergestellt", "Booking restored", "Rezervasyon geri yüklendi"],
  purged: ["Endgültig gelöscht", "Permanently deleted", "Kalıcı olarak silindi"],
  trashEmpty: ["Papierkorb ist leer.", "Trash is empty.", "Çöp kutusu boş."],
  deletedBy: ["Gelöscht von {{name}} · {{date}}", "Deleted by {{name}} · {{date}}", "Silen: {{name}} · {{date}}"],
  reason: ["Grund", "Reason", "Gerekçe"],
  restore: ["Wiederherstellen", "Restore", "Geri yükle"],
  purge: ["Endgültig löschen", "Delete permanently", "Kalıcı sil"],
} as const;

export const legacyUiTranslations = Object.fromEntries(
  ["de", "en", "tr"].map((lang, index) => [lang, Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, values[index]]))]),
) as Record<"de" | "en" | "tr", Record<string, string>>;

export function displayLocale() {
  const lang = i18n.resolvedLanguage ?? i18n.language ?? "de";
  return lang.startsWith("en") ? "en-GB" : lang.startsWith("tr") ? "tr-TR" : "de-DE";
}