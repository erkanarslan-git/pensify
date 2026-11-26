import { describe, expect, it } from "vitest";
import { accessMessage, bookingMessage, whatsappDigits, MESSAGE_LANGUAGES, isMessageLang } from "./guest-messages";

const s = { guestName: "Anna", propertyName: "Dom", room: "101", checkIn: "2026-11-02", checkOut: "2026-11-05", amount: 150 };
const g = { check_in_time: "15:00", check_out_time: "11:00", iban: "DE89370400440532013000" };

describe("guest messages", () => {
  it("uses the saved text for the selected language and substitutes reservation data", () => {
    const settings = { ...g, message_templates: { de: { booking: "{{guest_name}} / {{room}} / {{check_in}}" } } };
    expect(bookingMessage(s, settings, "de", false)).toBe("Anna / 101 / 02.11.2026");
    expect(bookingMessage(s, settings, "tr", false)).toBe(bookingMessage(s, g, "tr", false));
  });
  it("never expands code placeholders in a booking template", () => {
    const settings = { ...g, message_templates: { de: { booking: "{{guest_name}} {{access_codes}} {{building_code}} {{door_code}} {{keybox_code}}" } } };
    expect(bookingMessage(s, settings, "de", false)).toBe("Anna");
  });
  it("substitutes revealed codes only in access templates and does not expand guest input", () => {
    const settings = { ...g, message_templates: { de: { access: "{{guest_name}} {{keybox_code}} {{bank_details}}" } } };
    expect(accessMessage({ ...s, guestName: "{{building_code}}" }, settings, "de", { building: "123456", keybox: "9465" })).toBe("{{building_code}} 9465");
  });
  it("keeps bank details optional in custom templates", () => {
    const settings = { ...g, message_templates: { de: { booking: "Anna {{bank_details}}" } } };
    expect(bookingMessage(s, settings, "de", false)).toBe("Anna");
    expect(bookingMessage(s, settings, "de", true)).toContain(g.iban);
  });
  it("restores defaults when a custom template is removed", () => {
    expect(bookingMessage(s, { ...g, message_templates: { de: { booking: " " } } }, "de", false)).toBe(bookingMessage(s, g, "de", false));
  });
  it("offers the requested guest languages independently of the phone number", () => {
    expect(MESSAGE_LANGUAGES.map(({ value }) => value)).toEqual(["de", "en", "tr", "pl", "sk", "hr", "sr", "bs", "ru"]);
    expect(isMessageLang("sk")).toBe(true);
    expect(isMessageLang("uk")).toBe(false);
    expect(isMessageLang("unknown")).toBe(false);
    const guest = { ...s, guestPhone: "+49 176 1234567" };
    expect(bookingMessage(guest, g, "pl", false)).toBe(bookingMessage(s, g, "pl", false));
    expect(bookingMessage(s, g, "pl", false)).not.toBe(bookingMessage(s, g, "de", false));
  });
  it.each(["pl", "sk", "hr", "sr", "bs", "ru"] as const)("keeps booking and access information separate in %s", (lang) => {
    const booking = bookingMessage(s, g, lang, false);
    const access = accessMessage(s, g, lang, { building: "123456", keybox: "9465" });
    expect(booking).not.toContain("123456");
    expect(booking).not.toContain("9465");
    expect(access).toContain("123456");
    expect(access).toContain("9465");
    expect(access).not.toContain(g.iban);
  });
  it("booking message never contains codes and shows times", () => {
    const m = bookingMessage(s, g, "de", true);
    expect(m).toContain("02.11.2026 – 05.11.2026"); expect(m).toContain("IBAN: DE89");
    expect(m).toContain("nach Zahlungseingang"); expect(m).not.toContain("Code:");
  });
  it("bank details are left out when not chosen", () => {
    expect(bookingMessage(s, g, "de", false)).not.toContain("IBAN");
  });
  it("German access message lists every room of the booking with its key box code", () => {
    const m = accessMessage({ ...s, room: "501 / 502" }, { ...g, check_in_time: "18:00", check_in_until: "22:00" }, "de", { rooms: [{ room: "501", keybox: "9465" }, { room: "502", keybox: "2341" }] });
    expect(m).toContain("Zimmernummern: 501 / 502"); expect(m).toContain("Zimmer 501: Nr. 501 / Code: 9465");
    expect(m).toContain("Zimmer 502: Nr. 502 / Code: 2341"); expect(m).toContain("von 18:00-22:00 Uhr");
  });
  it("writes an open-ended checkout in the guest language without a technical date", () => {
    const openStay = { ...s, checkOut: "9999-12-31" };
    expect(bookingMessage(openStay, g, "de", false)).toContain("02.11.2026 – offen");
    expect(bookingMessage(openStay, g, "tr", false)).toContain("02.11.2026 – açık uçlu");
    expect(bookingMessage(openStay, g, "en", false)).not.toContain("9999");
  });
  it("normalizes phone numbers for WhatsApp", () => {
    expect(whatsappDigits("0176 1234567")).toBe("491761234567");
    expect(whatsappDigits("+90 532 111 2233")).toBe("905321112233");
    expect(whatsappDigits("abc")).toBeNull();
  });
});
