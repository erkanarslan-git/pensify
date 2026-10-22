import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import de from "./locales/de.json";
import en from "./locales/en.json";
import tr from "./locales/tr.json";
import { attendanceTranslations } from "./attendance";
import { clockTranslations } from "./clock";
import { teamSafetyTranslations } from "./team-safety";
import { bookingAvailabilityTranslations } from "./booking-availability";

export const SUPPORTED_LANGS = ["de", "en", "tr"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        de: { translation: { ...de, attendance: attendanceTranslations.de, clock: clockTranslations.de, teamSafety: teamSafetyTranslations.de, bookingAvailability: bookingAvailabilityTranslations.de } },
        en: { translation: { ...en, attendance: attendanceTranslations.en, clock: clockTranslations.en, teamSafety: teamSafetyTranslations.en, bookingAvailability: bookingAvailabilityTranslations.en } },
        tr: { translation: { ...tr, attendance: attendanceTranslations.tr, clock: clockTranslations.tr, teamSafety: teamSafetyTranslations.tr, bookingAvailability: bookingAvailabilityTranslations.tr } },
      },
      fallbackLng: "de",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      load: "languageOnly",
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
        lookupLocalStorage: "pensify.lang",
      },
    });
}

export default i18n;
