import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import de from "./locales/de.json";
import en from "./locales/en.json";
import tr from "./locales/tr.json";
import { attendanceTranslations } from "./attendance";
import { clockTranslations } from "./clock";
import { todosTranslations } from "./todos";
import { paymentsTranslations } from "./payments";
import { bankTranslations } from "./bank";
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
        de: { translation: { ...de, attendance: attendanceTranslations.de, clock: clockTranslations.de, todos: todosTranslations.de, payments: paymentsTranslations.de, bank: bankTranslations.de, teamSafety: teamSafetyTranslations.de, bookingAvailability: bookingAvailabilityTranslations.de } },
        en: { translation: { ...en, attendance: attendanceTranslations.en, clock: clockTranslations.en, todos: todosTranslations.en, payments: paymentsTranslations.en, bank: bankTranslations.en, teamSafety: teamSafetyTranslations.en, bookingAvailability: bookingAvailabilityTranslations.en } },
        tr: { translation: { ...tr, attendance: attendanceTranslations.tr, clock: clockTranslations.tr, todos: todosTranslations.tr, payments: paymentsTranslations.tr, bank: bankTranslations.tr, teamSafety: teamSafetyTranslations.tr, bookingAvailability: bookingAvailabilityTranslations.tr } },
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

// Keep translations fresh after hot reloads (init runs only once per page).
for (const [lng, data] of Object.entries({ de, en, tr })) {
  i18n.addResourceBundle(lng, "translation", data, true, true);
}

export default i18n;
