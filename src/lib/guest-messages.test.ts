import { describe, expect, it } from "vitest";
import { accessMessage, bookingMessage, whatsappDigits, MESSAGE_LANGUAGES, isMessageLang } from "./guest-messages";

const s = { guestName: "Anna", propertyName: "Dom", room: "101", checkIn: "2026-11-02", checkOut: "2026-11-05", amount: 150 };
const g = { check_in_time: "15:00", check_out_time: "11:00", iban: "DE89370400440532013000" };

describe("guest messages", () => {
  it("offers the six requested guest languages independently of the phone number", () => {
    expect(MESSAGE_LANGUAGES.map(({ value }) => value)).toEqual(["de", "en", "tr", "pl", "uk", "ru"]);
    expect(isMessageLang("uk")).toBe(true);
    expect(isMessageLang("unknown")).toBe(false);
    const guest = { ...s, guestPhone: "+49 176 1234567" };
    expect(bookingMessage(guest, g, "pl", false)).toBe(bookingMessage(s, g, "pl", false));
    expect(bookingMessage(s, g, "pl", false)).not.toBe(bookingMessage(s, g, "de", false));
  });
  it.each(["pl", "uk", "ru"] as const)("keeps booking and access information separate in %s", (lang) => {
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
  it("access message uses the short room – code format", () => {
    const m = accessMessage(s, { ...g, check_in_until: "22:00" }, "de", { keybox: "9465" });
    expect(m).toContain("Zimmer 101 – Code: 9465"); expect(m).toContain("Check-in: 15:00–22:00");
  });
  it("normalizes phone numbers for WhatsApp", () => {
    expect(whatsappDigits("0176 1234567")).toBe("491761234567");
    expect(whatsappDigits("+90 532 111 2233")).toBe("905321112233");
    expect(whatsappDigits("abc")).toBeNull();
  });
});
