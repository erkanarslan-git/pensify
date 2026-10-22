const codes = [
  "unauthenticated", "unknown_location", "forbidden", "no_staff_profile", "already_clocked_in",
  "location_not_configured", "location_required", "location_inaccurate", "too_far", "no_open_shift",
  "reason_required", "invalid_range", "future_time", "overlap", "not_found",
] as const;
export type ClockErrorCode = (typeof codes)[number];

export const clockTranslations = {
  de: {
    errors: {
      unauthenticated: "Bitte erneut anmelden.", unknown_location: "Unbekannter QR-Code oder Standort.", forbidden: "Keine Berechtigung für diesen Standort.",
      no_staff_profile: "Dein Konto hat kein Mitarbeiterprofil.", already_clocked_in: "Du bist bereits an einem anderen Standort eingestempelt.",
      location_not_configured: "Für diesen Standort sind keine Koordinaten hinterlegt.", location_required: "Standortfreigabe erforderlich.",
      location_inaccurate: "Standort zu ungenau. Bitte im Freien erneut versuchen.", too_far: "Du bist zu weit vom Standort entfernt.",
      no_open_shift: "Keine offene Schicht.", reason_required: "Bitte einen Grund angeben.", invalid_range: "Ende muss nach dem Beginn liegen.",
      future_time: "Zeiten in der Zukunft sind nicht erlaubt.", overlap: "Überschneidet sich mit einer anderen Schicht.", not_found: "Eintrag nicht gefunden.",
      network: "Keine Verbindung. Nichts wurde gespeichert – bitte erneut versuchen.", unknown: "Aktion fehlgeschlagen. Nichts wurde gespeichert.",
    },
    needsReview: "Prüfung nötig", missingClockOut: "Ausstempeln vergessen", tooLong: "Ungewöhnlich lang",
    correct: "Korrigieren", correctTitle: "Schicht korrigieren", reason: "Grund (Pflicht)", start: "Beginn", end: "Ende", breakMin: "Pause (Min.)",
    save: "Speichern", cancel: "Abbrechen", saved: "Korrektur gespeichert", history: "Änderungsverlauf", noHistory: "Keine Änderungen",
    endNowReason: "Grund für das Beenden", endPrompt: "Warum beendest du diese Schicht für die Person?",
  },
  en: {
    errors: {
      unauthenticated: "Please sign in again.", unknown_location: "Unknown QR code or location.", forbidden: "No permission for this location.",
      no_staff_profile: "Your account has no staff profile.", already_clocked_in: "You are already clocked in at another location.",
      location_not_configured: "No coordinates are set for this location.", location_required: "Location permission required.",
      location_inaccurate: "Location too inaccurate. Please try again outdoors.", too_far: "You are too far from the location.",
      no_open_shift: "No open shift.", reason_required: "Please enter a reason.", invalid_range: "End must be after start.",
      future_time: "Future times are not allowed.", overlap: "Overlaps another shift.", not_found: "Entry not found.",
      network: "No connection. Nothing was saved – please try again.", unknown: "Action failed. Nothing was saved.",
    },
    needsReview: "Needs review", missingClockOut: "Clock-out forgotten", tooLong: "Unusually long",
    correct: "Correct", correctTitle: "Correct shift", reason: "Reason (required)", start: "Start", end: "End", breakMin: "Break (min)",
    save: "Save", cancel: "Cancel", saved: "Correction saved", history: "Change history", noHistory: "No changes",
    endNowReason: "Reason for ending", endPrompt: "Why are you ending this shift for the person?",
  },
  tr: {
    errors: {
      unauthenticated: "Lütfen tekrar giriş yapın.", unknown_location: "Bilinmeyen QR kod veya lokasyon.", forbidden: "Bu lokasyon için yetkiniz yok.",
      no_staff_profile: "Hesabınıza bağlı personel profili yok.", already_clocked_in: "Zaten başka bir lokasyonda mesainiz açık.",
      location_not_configured: "Bu lokasyon için konum bilgisi tanımlı değil.", location_required: "Konum izni gerekli.",
      location_inaccurate: "Konum yeterince doğru değil. Açık alanda tekrar deneyin.", too_far: "Lokasyona çok uzaktasınız.",
      no_open_shift: "Açık mesai yok.", reason_required: "Lütfen bir gerekçe yazın.", invalid_range: "Bitiş, başlangıçtan sonra olmalı.",
      future_time: "Gelecek saat girilemez.", overlap: "Başka bir mesaiyle çakışıyor.", not_found: "Kayıt bulunamadı.",
      network: "İnternet bağlantısı yok. Hiçbir şey kaydedilmedi – tekrar deneyin.", unknown: "İşlem başarısız. Hiçbir şey kaydedilmedi.",
    },
    needsReview: "Kontrol gerekli", missingClockOut: "Çıkış unutulmuş", tooLong: "Olağandışı uzun",
    correct: "Düzelt", correctTitle: "Mesaiyi düzelt", reason: "Gerekçe (zorunlu)", start: "Başlangıç", end: "Bitiş", breakMin: "Mola (dk)",
    save: "Kaydet", cancel: "Vazgeç", saved: "Düzeltme kaydedildi", history: "Değişiklik geçmişi", noHistory: "Değişiklik yok",
    endNowReason: "Bitirme gerekçesi", endPrompt: "Bu kişinin mesaisini neden siz bitiriyorsunuz?",
  },
};

/** Map a backend error to a translation key under `clock.errors`. */
export function clockErrorKey(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  if (/failed to fetch|network|load failed/i.test(msg)) return "clock.errors.network";
  const hit = codes.find((c) => msg === c || msg.includes(c));
  return hit ? `clock.errors.${hit}` : "clock.errors.unknown";
}
