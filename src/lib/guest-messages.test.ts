import { describe, expect, it } from "vitest";
import { accessMessage, bookingMessage, whatsappDigits } from "./guest-messages";

const s = { guestName: "Anna", propertyName: "Dom", room: "101", checkIn: "2026-11-02", checkOut: "2026-11-05", amount: 150 };
const g = { check_in_time: "15:00", check_out_time: "11:00", iban: "DE89370400440532013000" };

describe("guest messages", () => {
  it("booking message never contains codes and shows times", () => {
    const m = bookingMessage(s, g, "de", true);
    expect(m).toContain("ab 15:00"); expect(m).toContain("bis 11:00"); expect(m).toContain("IBAN: DE89");
  });
  it("bank details are left out when not chosen", () => {
    expect(bookingMessage(s, g, "de", false)).not.toContain("IBAN");
  });
  it("access message includes the room code", () => {
    expect(accessMessage(s, g, "en", { door: "4711" })).toContain("Room code: 4711");
  });
  it("normalizes phone numbers for WhatsApp", () => {
    expect(whatsappDigits("0176 1234567")).toBe("491761234567");
    expect(whatsappDigits("+90 532 111 2233")).toBe("905321112233");
    expect(whatsappDigits("abc")).toBeNull();
  });
});
