export type MessageLang = "de" | "en" | "tr";
export interface GuestInfoSettings {
  check_in_time: string; check_out_time: string; check_in_until?: string | null;
  account_holder?: string | null; iban?: string | null; bic?: string | null; bank_name?: string | null;
  contact_phone?: string | null; extra_note?: string | null;
}
export interface StayInfo {
  guestName: string; propertyName: string; address?: string | null; room: string;
  checkIn: string; checkOut: string; amount?: number | null; reference?: string | null;
}

const L = {
  de: { hello: "Hallo", thanks: "vielen Dank für Ihre Buchung bei Pension Highway!", stay: "Aufenthalt", addr: "Adresse", room: "Zimmer", amount: "Betrag", pay: "Zahlung per Überweisung:", holder: "Kontoinhaber", ref: "Verwendungszweck", later: "Ihre Zugangscodes erhalten Sie nach Zahlungseingang.", ready: "hier sind Ihre Informationen für den Check-in.", code: "Code", building: "Haustür", checkin: "Check-in", keys: "Die Schlüssel finden Sie in den Schlüsselboxen.", contact: "Bei Fragen", bye: "Wir wünschen Ihnen einen angenehmen Aufenthalt!", team: "Ihr Pension-Highway-Team" },
  en: { hello: "Hello", thanks: "thank you for booking with Pension Highway!", stay: "Stay", addr: "Address", room: "Room", amount: "Amount", pay: "Payment by bank transfer:", holder: "Account holder", ref: "Reference", later: "You will receive your access codes once payment is received.", ready: "here is your check-in information.", code: "Code", building: "Entrance", checkin: "Check-in", keys: "Your keys are in the key boxes.", contact: "Questions", bye: "We wish you a pleasant stay!", team: "Your Pension Highway team" },
  tr: { hello: "Merhaba", thanks: "Pension Highway'i tercih ettiğiniz için teşekkür ederiz!", stay: "Konaklama", addr: "Adres", room: "Oda", amount: "Tutar", pay: "Havale ile ödeme:", holder: "Hesap sahibi", ref: "Açıklama", later: "Giriş şifreleriniz ödemeniz alındıktan sonra iletilecektir.", ready: "check-in bilgileriniz aşağıdadır.", code: "Şifre", building: "Bina kapısı", checkin: "Giriş", keys: "Anahtarlar anahtar kutularındadır.", contact: "Sorularınız için", bye: "İyi konaklamalar dileriz!", team: "Pension Highway ekibi" },
} as const;

const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const address = (s: StayInfo) => s.address ? `${s.propertyName}, ${s.address}` : s.propertyName;

/** Short welcome/confirmation; never contains access codes. Bank details are optional. */
export function bookingMessage(s: StayInfo, g: GuestInfoSettings, lang: MessageLang, includeBank: boolean): string {
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
  return out.join("\n");
}

/** Check-in info in the short format the office asked for. */
export function accessMessage(s: StayInfo, g: GuestInfoSettings, lang: MessageLang, codes: { building?: string | null; door?: string | null; keybox?: string | null }): string {
  const l = L[lang];
  const out = [`${l.hello} ${s.guestName},`, l.ready, "", `${l.addr}: ${address(s)}`];
  if (codes.building) out.push(`${l.building} – ${l.code}: ${codes.building}`);
  const roomCode = codes.keybox ?? codes.door;
  out.push(roomCode ? `${l.room} ${s.room} – ${l.code}: ${roomCode}` : `${l.room} ${s.room}`);
  out.push(`${l.checkin}: ${g.check_in_time}${g.check_in_until ? `–${g.check_in_until}` : ""}`, "", l.keys);
  if (g.contact_phone) out.push(`${l.contact}: ${g.contact_phone}`);
  out.push("", l.bye, l.team);
  return out.join("\n");
}

/** wa.me needs digits only; German local numbers (0...) get the 49 prefix. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.trim().replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1); else if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "49" + d.slice(1);
  return /^\d{8,15}$/.test(d) ? d : null;
}
