export function berlinToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

const de = {
  close: "Zimmer schließen", open: "Wieder öffnen",
  closeTitle: (n: string) => `Zimmer ${n} schließen?`, openTitle: (n: string) => `Zimmer ${n} wieder öffnen?`,
  closeText: "Das Zimmer verschwindet aus Kalender, neuen Buchungen, Reinigung und der Zimmerzählung im Dashboard. Neue Buchungen sind nicht mehr möglich. Vergangene Buchungen, Gästedaten und Berichte bleiben erhalten. Sie können das Zimmer jederzeit wieder öffnen.",
  openText: "Das Zimmer erscheint wieder in Kalender, Buchungen und Zählungen und kann wieder gebucht werden.",
  upcoming: (n: number) => `Achtung: ${n} laufende oder zukünftige Buchung(en) in diesem Zimmer bleiben bestehen. Bitte ggf. in ein anderes Zimmer verschieben.`,
  failed: "Aktion fehlgeschlagen", closed: "Zimmer geschlossen", opened: "Zimmer wieder geöffnet",
  sectionTitle: "Zimmer schließen", sectionHint: "Aus Verkauf und Zählungen nehmen, Verlauf bleibt.",
  listTitle: (n: number) => `Geschlossene Zimmer (${n})`, badge: "Geschlossen",
};
const tr: typeof de = {
  close: "Odayı kapat", open: "Yeniden aç",
  closeTitle: (n) => `${n} numaralı oda kapatılsın mı?`, openTitle: (n) => `${n} numaralı oda yeniden açılsın mı?`,
  closeText: "Oda takvimden, yeni rezervasyon listesinden, temizlikten ve paneldeki oda sayısından çıkarılır. Bu odaya yeni rezervasyon yapılamaz. Geçmiş rezervasyonlar, misafir kayıtları ve raporlar korunur. Odayı istediğiniz zaman yeniden açabilirsiniz.",
  openText: "Oda yeniden takvimde, rezervasyonlarda ve sayımlarda görünür ve rezervasyona açılır.",
  upcoming: (n) => `Dikkat: Bu odada devam eden veya ileri tarihli ${n} rezervasyon var, bunlar silinmez. Gerekirse başka odaya taşıyın.`,
  failed: "İşlem yapılamadı", closed: "Oda kapatıldı", opened: "Oda yeniden açıldı",
  sectionTitle: "Odayı kapat", sectionHint: "Satıştan ve sayımlardan çıkar, geçmiş korunur.",
  listTitle: (n) => `Kapalı odalar (${n})`, badge: "Kapalı",
};
const en: typeof de = {
  close: "Close room", open: "Reopen",
  closeTitle: (n) => `Close room ${n}?`, openTitle: (n) => `Reopen room ${n}?`,
  closeText: "The room is removed from the calendar, new bookings, cleaning and the dashboard room count. It can no longer be booked. Past bookings, guest records and reports are kept. You can reopen it at any time.",
  openText: "The room appears again in the calendar, bookings and counts and can be booked again.",
  upcoming: (n) => `Note: ${n} current or upcoming booking(s) in this room stay unchanged. Move them to another room if needed.`,
  failed: "Action failed", closed: "Room closed", opened: "Room reopened",
  sectionTitle: "Close room", sectionHint: "Remove from sale and counts, history is kept.",
  listTitle: (n) => `Closed rooms (${n})`, badge: "Closed",
};
export function roomActiveCopy(lang: string | undefined) {
  return lang?.startsWith("tr") ? tr : lang?.startsWith("en") ? en : de;
}
