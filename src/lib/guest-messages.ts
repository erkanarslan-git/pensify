export const MESSAGE_LANGUAGES = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "pl", label: "Polski" },
  { value: "sk", label: "Slovenčina" },
  { value: "hr", label: "Hrvatski" },
  { value: "sr", label: "Srpski" },
  { value: "bs", label: "Bosanski" },
  { value: "ru", label: "Русский" },
] as const;
export type MessageLang = (typeof MESSAGE_LANGUAGES)[number]["value"];
export function isMessageLang(value: string): value is MessageLang {
  return MESSAGE_LANGUAGES.some((language) => language.value === value);
}
export interface GuestInfoSettings {
  check_in_time: string; check_out_time: string; check_in_until?: string | null;
  account_holder?: string | null; iban?: string | null; bic?: string | null; bank_name?: string | null;
  contact_phone?: string | null; extra_note?: string | null;
  message_templates?: unknown;
}
export type MessageMode = "booking" | "access";
export type MessageTemplates = Partial<Record<MessageLang, Partial<Record<MessageMode, string>>>>;
export const MESSAGE_FIELDS = ["guest_name", "property_name", "address", "room", "check_in", "check_out", "check_in_time", "check_out_time", "amount", "bank_details", "contact_phone", "extra_note", "rooms", "room_codes"] as const;
export function readMessageTemplates(value: unknown): MessageTemplates {
  const out: MessageTemplates = {};
  if (!value || typeof value !== "object") return out;
  for (const { value: lang } of MESSAGE_LANGUAGES) {
    const entry = (value as Record<string, unknown>)[lang];
    if (!entry || typeof entry !== "object") continue;
    const modes: Partial<Record<MessageMode, string>> = {};
    for (const mode of ["booking", "access"] as const) {
      const text = (entry as Record<string, unknown>)[mode];
      if (typeof text === "string" && text.trim()) modes[mode] = text;
    }
    out[lang] = modes;
  }
  return out;
}
export interface StayInfo {
  guestName: string; propertyName: string; address?: string | null; room: string;
  checkIn: string; checkOut: string; amount?: number | null; reference?: string | null;
}

const L = {
  de: { hello: "Hallo", thanks: "vielen Dank für Ihre Buchung bei Pension Highway!", stay: "Aufenthalt", addr: "Adresse", room: "Zimmer", amount: "Betrag", pay: "Zahlung per Überweisung:", holder: "Kontoinhaber", ref: "Verwendungszweck", later: "Ihre Zugangscodes erhalten Sie nach Zahlungseingang.", ready: "hier sind Ihre Informationen für den Check-in.", code: "Code", building: "Haustür", checkin: "Check-in", keys: "Die Schlüssel finden Sie in den Schlüsselboxen.", contact: "Bei Fragen", bye: "Wir wünschen Ihnen einen angenehmen Aufenthalt!", team: "Ihr Pension-Highway-Team" },
  en: { hello: "Hello", thanks: "thank you for booking with Pension Highway!", stay: "Stay", addr: "Address", room: "Room", amount: "Amount", pay: "Payment by bank transfer:", holder: "Account holder", ref: "Reference", later: "You will receive your access codes once payment is received.", ready: "here is your check-in information.", code: "Code", building: "Entrance", checkin: "Check-in", keys: "Your keys are in the key boxes.", contact: "Questions", bye: "We wish you a pleasant stay!", team: "Your Pension Highway team" },
  tr: { hello: "Merhaba", thanks: "Pension Highway'i tercih ettiğiniz için teşekkür ederiz!", stay: "Konaklama", addr: "Adres", room: "Oda", amount: "Tutar", pay: "Havale ile ödeme:", holder: "Hesap sahibi", ref: "Açıklama", later: "Giriş şifreleriniz ödemeniz alındıktan sonra iletilecektir.", ready: "check-in bilgileriniz aşağıdadır.", code: "Şifre", building: "Bina kapısı", checkin: "Giriş", keys: "Anahtarlar anahtar kutularındadır.", contact: "Sorularınız için", bye: "İyi konaklamalar dileriz!", team: "Pension Highway ekibi" },
  pl: { hello: "Dzień dobry", thanks: "dziękujemy za rezerwację w Pension Highway!", stay: "Pobyt", addr: "Adres", room: "Pokój", amount: "Kwota", pay: "Płatność przelewem:", holder: "Właściciel konta", ref: "Tytuł przelewu", later: "Kody dostępu otrzymają Państwo po zaksięgowaniu płatności.", ready: "poniżej znajdują się informacje dotyczące zameldowania.", code: "Kod", building: "Drzwi wejściowe", checkin: "Zameldowanie", keys: "Klucze znajdują się w skrytkach na klucze.", contact: "Kontakt", bye: "Życzymy miłego pobytu!", team: "Zespół Pension Highway" },
  sk: { hello: "Dobrý deň", thanks: "ďakujeme za rezerváciu v Pension Highway!", stay: "Pobyt", addr: "Adresa", room: "Izba", amount: "Suma", pay: "Platba bankovým prevodom:", holder: "Majiteľ účtu", ref: "Účel platby", later: "Prístupové kódy vám zašleme po pripísaní platby.", ready: "nižšie nájdete informácie k ubytovaniu.", code: "Kód", building: "Vstupné dvere", checkin: "Ubytovanie", keys: "Kľúče nájdete v kľúčových boxoch.", contact: "Kontakt", bye: "Prajeme príjemný pobyt!", team: "Tím Pension Highway" },
  hr: { hello: "Poštovani", thanks: "hvala vam na rezervaciji u Pension Highway!", stay: "Boravak", addr: "Adresa", room: "Soba", amount: "Iznos", pay: "Plaćanje bankovnim prijenosom:", holder: "Vlasnik računa", ref: "Svrha plaćanja", later: "Šifre za ulaz dobit ćete nakon zaprimanja uplate.", ready: "u nastavku su informacije za prijavu.", code: "Šifra", building: "Ulazna vrata", checkin: "Prijava", keys: "Ključevi se nalaze u kutijama za ključeve.", contact: "Kontakt", bye: "Želimo vam ugodan boravak!", team: "Vaš Pension Highway tim" },
  sr: { hello: "Poštovani", thanks: "hvala vam na rezervaciji u Pension Highway!", stay: "Boravak", addr: "Adresa", room: "Soba", amount: "Iznos", pay: "Plaćanje bankovnim transferom:", holder: "Vlasnik računa", ref: "Svrha plaćanja", later: "Šifre za ulaz dobićete nakon primljene uplate.", ready: "u nastavku su informacije za prijavu.", code: "Šifra", building: "Ulazna vrata", checkin: "Prijava", keys: "Ključevi se nalaze u kutijama za ključeve.", contact: "Kontakt", bye: "Želimo vam ugodan boravak!", team: "Vaš Pension Highway tim" },
  bs: { hello: "Poštovani", thanks: "hvala vam na rezervaciji u Pension Highway!", stay: "Boravak", addr: "Adresa", room: "Soba", amount: "Iznos", pay: "Plaćanje bankovnim transferom:", holder: "Vlasnik računa", ref: "Svrha plaćanja", later: "Šifre za ulaz dobit ćete nakon primljene uplate.", ready: "u nastavku su informacije za prijavu.", code: "Šifra", building: "Ulazna vrata", checkin: "Prijava", keys: "Ključevi se nalaze u kutijama za ključeve.", contact: "Kontakt", bye: "Želimo vam ugodan boravak!", team: "Vaš Pension Highway tim" },
  ru: { hello: "Здравствуйте", thanks: "спасибо за бронирование в Pension Highway!", stay: "Проживание", addr: "Адрес", room: "Комната", amount: "Сумма", pay: "Оплата банковским переводом:", holder: "Владелец счёта", ref: "Назначение платежа", later: "Вы получите коды доступа после поступления оплаты.", ready: "ниже приведена информация для заселения.", code: "Код", building: "Входная дверь", checkin: "Заселение", keys: "Ключи находятся в ящиках для ключей.", contact: "Контакт", bye: "Желаем приятного пребывания!", team: "Команда Pension Highway" },
} as const;

const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const address = (s: StayInfo) => s.address ? `${s.propertyName}, ${s.address}` : s.propertyName;

const DE_ACCESS = "Hallo {{guest_name}},\n\nder Aufenthalt beginnt bald. Hier sind die noch fehlenden Informationen für den Check-in:\n\nAdresse: {{address}}\n\nZimmernummern: {{rooms}}\n\nSchlüsselboxen:\n\n{{room_codes}}\n\nDer selbstständige Check-in ist von {{check_in_time}} Uhr jederzeit möglich.\n\nBei Fragen oder falls Hilfe benötigt wird, stehen wir gerne zur Verfügung. {{contact_phone}}\n\nWir wünschen eine angenehme Anreise und einen schönen Aufenthalt.\n\n{{extra_note}}";
export function defaultMessageTemplate(mode: MessageMode, lang: MessageLang): string {
  const l = L[lang];
  if (mode === "access" && lang === "de") return DE_ACCESS;
  return mode === "booking"
    ? `${l.hello} {{guest_name}}, ${l.thanks}\n\n${l.stay}: {{check_in}} – {{check_out}}\n${l.addr}: {{address}}\n${l.amount}: {{amount}}\n{{bank_details}}\n\n${l.later}\n{{extra_note}}`
    : `${l.hello} {{guest_name}},\n${l.ready}\n\n${l.addr}: {{address}}\n${l.room}: {{rooms}}\n\n{{room_codes}}\n\n${l.checkin}: {{check_in_time}}\n\n${l.keys}\n{{contact_phone}}\n\n${l.bye}\n${l.team}\n{{extra_note}}`;
}

export interface RoomCode { room: string; door?: string | null; keybox?: string | null }
export interface AccessCodes { building?: string | null; door?: string | null; keybox?: string | null; rooms?: RoomCode[] }
function roomList(s: StayInfo, codes?: AccessCodes): RoomCode[] {
  return codes?.rooms?.length ? codes.rooms : [{ room: s.room, door: codes?.door ?? null, keybox: codes?.keybox ?? null }];
}
/** One line per room, e.g. "Zimmer 501: Nr. 501 / Code: 9465". */
function roomCodeLines(lang: MessageLang, s: StayInfo, codes?: AccessCodes): string {
  const l = L[lang];
  return roomList(s, codes).map((r) => { const c = r.keybox ?? r.door; return c ? `${l.room} ${r.room}: Nr. ${r.room} / ${l.code}: ${c}` : `${l.room} ${r.room}`; }).join("\n\n");
}

function renderTemplate(template: string, s: StayInfo, g: GuestInfoSettings, lang: MessageLang, bank: boolean, codes?: AccessCodes): string {
  const l = L[lang];
  const bankDetails = bank && g.iban ? [l.pay, g.account_holder ? `${l.holder}: ${g.account_holder}` : "", `IBAN: ${g.iban}`, s.reference ? `${l.ref}: ${s.reference}` : ""].filter(Boolean).join("\n") : "";
  const roomCode = codes?.keybox ?? codes?.door;
  const fields: Record<string, string> = {
    guest_name: s.guestName, property_name: s.propertyName, address: address(s), room: s.room,
    check_in: fmtDate(s.checkIn), check_out: fmtDate(s.checkOut), check_in_time: g.check_in_time, check_out_time: g.check_out_time,
    amount: s.amount != null ? `${s.amount.toFixed(2).replace(".", lang === "en" ? "." : ",")} €` : "",
    bank_details: bankDetails, contact_phone: g.contact_phone ?? "", extra_note: g.extra_note ?? "",
    access_codes: codes ? [codes.building ? `${l.building} – ${l.code}: ${codes.building}` : "", roomCode ? `${l.room} ${s.room} – ${l.code}: ${roomCode}` : `${l.room} ${s.room}`].filter(Boolean).join("\n") : "",
    rooms: roomList(s, codes).map((r) => r.room).join(" / "), room_codes: codes ? roomCodeLines(lang, s, codes) : "",
    building_code: codes?.building ?? "", door_code: codes?.door ?? "", keybox_code: codes?.keybox ?? "",
  };
  // Substitute once: guest input and notes cannot expand into secret placeholders.
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => fields[key] ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Short welcome/confirmation; never contains access codes. Bank details are optional. */
export function bookingMessage(s: StayInfo, g: GuestInfoSettings, lang: MessageLang, includeBank: boolean): string {
  const custom = readMessageTemplates(g.message_templates)[lang]?.booking;
  if (custom) return renderTemplate(custom, s, g, lang, includeBank);
  const l = L[lang];
  const out = [`${l.hello} ${s.guestName}, ${l.thanks}`, "",
    `${l.stay}: ${fmtDate(s.checkIn)} – ${fmtDate(s.checkOut)}`,
    `${l.addr}: ${address(s)}`];
  if (s.amount && s.amount > 0) out.push(`${l.amount}: ${s.amount.toFixed(2).replace(".", lang === "en" ? "." : ",")} €`);
  if (includeBank && g.iban) {
    out.push("", l.pay);
    if (g.account_holder) out.push(`${l.holder}: ${g.account_holder}`);
    out.push(`IBAN: ${g.iban}`);
    if (s.reference) out.push(`${l.ref}: ${s.reference}`);
  }
  out.push("", l.later);
  if (g.extra_note) out.push("", g.extra_note);
  return out.join("\n");
}

/** Check-in info in the short format the office asked for. */
export function accessMessage(s: StayInfo, g: GuestInfoSettings, lang: MessageLang, codes: AccessCodes): string {
  const custom = readMessageTemplates(g.message_templates)[lang]?.access;
  const withWindow = { ...g, check_in_time: g.check_in_until ? `${g.check_in_time}-${g.check_in_until}` : g.check_in_time };
  if (custom) return renderTemplate(custom, s, g, lang, false, codes);
  if (lang === "de" || (codes.rooms?.length ?? 0) > 1) return renderTemplate(defaultMessageTemplate("access", lang), s, withWindow, lang, false, codes);
  const l = L[lang];
  const out = [`${l.hello} ${s.guestName},`, l.ready, "", `${l.addr}: ${address(s)}`];
  if (codes.building) out.push(`${l.building} – ${l.code}: ${codes.building}`);
  const roomCode = codes.keybox ?? codes.door;
  out.push(roomCode ? `${l.room} ${s.room} – ${l.code}: ${roomCode}` : `${l.room} ${s.room}`);
  out.push(`${l.checkin}: ${g.check_in_time}${g.check_in_until ? `–${g.check_in_until}` : ""}`, "", l.keys);
  if (g.contact_phone) out.push(`${l.contact}: ${g.contact_phone}`);
  out.push("", l.bye, l.team);
  if (g.extra_note) out.push("", g.extra_note);
  return out.join("\n");
}

/** wa.me needs digits only; German local numbers (0...) get the 49 prefix. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.trim().replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "49" + d.slice(1);
  return /^\d{8,15}$/.test(d) ? d : null;
}
