import { expect, it } from "vitest";
import { normalizeChannel, sourceColor, sourceLabel } from "./guest-color";

// phone/walkin/direct are the same kind of booking: one channel group, one color, one label.
it("phone, walk-in and direct collapse into one channel group", () => {
  expect(normalizeChannel("phone")).toBe("direct");
  expect(normalizeChannel("walkin")).toBe("direct");
  expect(normalizeChannel("direct")).toBe("direct");
  expect(normalizeChannel("tel")).toBe("direct");
});

it("the collapsed group shares one color so the donut cannot repeat a slice", () => {
  expect(sourceColor("phone")).toBe(sourceColor("direct"));
  expect(sourceColor("walkin")).toBe(sourceColor("direct"));
});

it("the group is labelled just Privat, without phone/e-mail wording", () => {
  expect(sourceLabel("phone")).toBe("Privat");
  expect(sourceLabel("walkin")).toBe("Privat");
  expect(sourceLabel("direct")).toBe("Privat");
});

it("booking platforms stay separate from the private group", () => {
  expect(normalizeChannel("booking.com")).toBe("booking");
  expect(normalizeChannel("airbnb")).toBe("airbnb");
  expect(normalizeChannel("website")).toBe("website");
});
