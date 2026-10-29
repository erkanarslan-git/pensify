export type MessageLang = "de" | "en" | "tr";
export interface GuestInfoSettings {
  check_in_time: string; check_out_time: string;
  account_holder?: string | null; iban?: string | null; bic?: string | null; bank_name?: string | null;
  contact_phone?: string | null; extra_note?: string | null;
}
export interface StayInfo {
  guestName: string; propertyName: string; address?: string | null; room: string;
  checkIn: string; checkOut: string; amount?: number | null; reference?: string | null;
}

const L = {
  de: { hello: "Hallo", conf: "Ihre Reservierung ist bestätigt.", prop: "Unterkunft", room: "Zimmer", in: "Anreise", out: "Abreise", from: "ab", until: "bis", amount: "Betrag", pay: "Zahlung per Überweisung möglich:", holder: "Kontoinhaber", ref: "Verwendungszweck", cash: "Sie können auch vor Ort bezahlen.", later: "Ihre Zugangscodes erhalten Sie vor der Anreise.", ready: "Willkommen! Hier sind Ihre Zugangsdaten.", building: "Haustür-Code", door: "Zimmer-Code", keybox: "Schlüsselbox", contact: "Bei Fragen", bye: "Wir wünschen Ihnen einen angenehmen Aufenthalt." },
  en: { hello: "Hello", conf: "Your reservation is confirmed.", prop: "Property", room: "Room", in: "Check-in", out: "Check-out", from: "from", until: "until", amount: "Amount", pay: "You can pay by bank transfer:", holder: "Account holder", ref: "Reference", cash: "You can also pay on site.", later: "You will receive your access codes before arrival.", ready: "Welcome! Here are your access details.", building: "Entrance code", door: "Room code", keybox: "Key box", contact: "Questions", bye: "We wish you a pleasant stay." },
  tr: { hello: "Merhaba", conf: "Rezervasyonunuz onaylandı.", prop: "Konaklama yeri", room: "Oda", in: "Giriş", out: "Çıkış", from: "saat", until: "saat", amount: "Tutar", pay: "Havale ile ödeme yapabilirsiniz:", holder: "Hesap sahibi", ref: "Açıklama", cash: "Dilerseniz yerinde de ödeyebilirsiniz.", later: "Giriş şifreleriniz varıştan önce gönderilecektir.", ready: "Hoş geldiniz! Giriş bilgileriniz aşağıdadır.", building: "Bina kapı şifresi", door: "Oda şifresi", keybox: "Anahtar kutusu", contact: "Sorularınız için", bye: "İyi konaklamalar dileriz." },
} as const;

const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const head = (s: StayInfo, g: GuestInfoSettings, l: (typeof L)[MessageLang]) => [
  `${l.prop}: ${s.propertyName}${s.address ? `, ${s.address}` : ""}`,
  `${l.room}: ${s.room}`,
  `${l.in}: ${fmtDate(s.checkIn)} (${l.from} ${g.check_in_time})`,
  `${l.out}: ${fmtDate(s.checkOut)} (${l.until} ${g.check_out_time})`,
];

/** Booking confirmation; never contains access codes. Bank details are optional. */
export function bookingMessage(s: StayInfo, g: GuestInfoSettings, lang: MessageLang, includeBank: boolean): string {
  const l = L[lang]; const out = [`${l.hello} ${s.guestName},`, "", l.conf, "", ...head(s, g, l)];
  if (s.amount && s.amount > 0) out.push(`${l.amount}: ${s.amount.toFixed(2).replace(".", lang === "en" ? "." : ",")} €`);
  if (includeBank && g.iban) {
    out.push("", l.pay);
    if (g.account_holder) out.push(`${l.holder}: ${g.account_holder}`);
    out.push(`IBAN: ${g.iban}`);
    if (g.bic) out.push(`BIC: ${g.bic}`);
    if (g.bank_name) out.push(g.bank_name);
    if (s.reference) out.push(`${l.ref}: ${s.reference}`);
    out.push(l.cash);
  }
  out.push("", l.later);
  if (g.extra_note) out.push("", g.extra_note);
  if (g.contact_phone) out.push("", `${l.contact}: ${g.contact_phone}`);
  out.push("", l.bye);
  return out.join("\n");
}

export function accessMessage(s: StayInfo, g: GuestInfoSettings, lang: MessageLang, codes: { building?: string | null; door?: string | null; keybox?: string | null }): string {
  const l = L[lang]; const out = [`${l.hello} ${s.guestName},`, "", l.ready, "", ...head(s, g, l), ""];
  if (codes.building) out.push(`${l.building}: ${codes.building}`);
  if (codes.door) out.push(`${l.door}: ${codes.door}`);
  if (codes.keybox) out.push(`${l.keybox}: ${codes.keybox}`);
  if (g.contact_phone) out.push("", `${l.contact}: ${g.contact_phone}`);
  out.push("", l.bye);
  return out.join("\n");
}

/** wa.me needs digits only; German local numbers (0...) get the 49 prefix. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.trim().replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "49" + d.slice(1);
  return /^\d{8,15}$/.test(d) ? d : null;
}
