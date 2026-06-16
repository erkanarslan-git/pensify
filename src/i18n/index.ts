import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import de from "./locales/de.json";
import en from "./locales/en.json";
import tr from "./locales/tr.json";

export const SUPPORTED_LANGS = ["de", "en", "tr"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        de: { translation: de },
        en: { translation: en },
        tr: { translation: tr },
      },
      fallbackLng: "de",
      supportedLngs: SUPPORTED_LANGS as unknown as string[],
      load: "languageOnly",
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
        lookupLocalStorage: "stayflow.lang",
      },
    });
}

export default i18n;
