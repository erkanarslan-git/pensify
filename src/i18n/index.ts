import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import de from "./locales/de.json";
import en from "./locales/en.json";
import tr from "./locales/tr.json";
import { attendanceTranslations } from "./attendance";
import { clockTranslations } from "./clock";
import { shiftTranslations } from "./shift";
import { overtimeTranslations } from "./overtime";
import { todosTranslations } from "./todos";
import { paymentsTranslations } from "./payments";
import { bankTranslations } from "./bank";
import { teamSafetyTranslations } from "./team-safety";
import { bookingAvailabilityTranslations } from "./booking-availability";
import { departmentTranslations } from "./departments";
import { tvTranslations } from "./tv";
import { reservationListTranslations } from "./reservation-list";
import { cleaningInspectionTranslations } from "./cleaning-inspection";
import { integrationTranslations } from "./integrations";
import { accessCodeTranslations } from "./access-codes";
import { todoDetailTranslations } from "./todo-details";
import { guestDirectoryTranslations } from "./guest-directory";
import { paymentExtraTranslations } from "./payment-extra";
import { calendarExtraTranslations } from "./calendar-extra";
import { fallbackTranslations } from "./fallback";
import { legacyUiTranslations } from "./legacy-ui";
import { legacyTextTranslations } from "./legacy-text";
import { simpleRecordsTranslations } from "./simple-records";
import { salesChannelTranslations } from "./sales-channels";

export const SUPPORTED_LANGS = ["de", "en", "tr"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        de: { translation: { ...de, attendance: attendanceTranslations.de, clock: clockTranslations.de, shift: shiftTranslations.de, todos: todosTranslations.de, payments: paymentsTranslations.de, bank: bankTranslations.de, teamSafety: teamSafetyTranslations.de, bookingAvailability: bookingAvailabilityTranslations.de, departments: departmentTranslations.de } },
        en: { translation: { ...en, attendance: attendanceTranslations.en, clock: clockTranslations.en, shift: shiftTranslations.en, todos: todosTranslations.en, payments: paymentsTranslations.en, bank: bankTranslations.en, teamSafety: teamSafetyTranslations.en, bookingAvailability: bookingAvailabilityTranslations.en, departments: departmentTranslations.en } },
        tr: { translation: { ...tr, attendance: attendanceTranslations.tr, clock: clockTranslations.tr, shift: shiftTranslations.tr, todos: todosTranslations.tr, payments: paymentsTranslations.tr, bank: bankTranslations.tr, teamSafety: teamSafetyTranslations.tr, bookingAvailability: bookingAvailabilityTranslations.tr, departments: departmentTranslations.tr } },
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
for (const lng of SUPPORTED_LANGS) {
  i18n.addResourceBundle(lng, "translation", {
    attendance: attendanceTranslations[lng], clock: clockTranslations[lng],
    shift: shiftTranslations[lng], overtime: overtimeTranslations[lng],
    todos: todosTranslations[lng], payments: paymentsTranslations[lng],
    bank: bankTranslations[lng], teamSafety: teamSafetyTranslations[lng],
    bookingAvailability: bookingAvailabilityTranslations[lng], departments: departmentTranslations[lng],
    tv: tvTranslations[lng],
    reservationList: reservationListTranslations[lng],
    cleaningInspection: cleaningInspectionTranslations[lng],
    integrations: integrationTranslations[lng],
    accessCodes: accessCodeTranslations[lng],
    todoDetails: todoDetailTranslations[lng],
    guests: guestDirectoryTranslations[lng],
    records: simpleRecordsTranslations[lng],
    salesChannels: salesChannelTranslations[lng],
    paymentExtra: paymentExtraTranslations[lng],
    calendarExtra: calendarExtraTranslations[lng],
    fallback: fallbackTranslations[lng],
    legacyUi: legacyUiTranslations[lng],
    legacyText: legacyTextTranslations[lng],
    common: { close: legacyUiTranslations[lng].close },
    dashboard: { properties: legacyUiTranslations[lng].properties },
  }, true, true);
}

export default i18n;
