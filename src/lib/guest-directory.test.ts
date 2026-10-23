import { expect, it } from "vitest";
import { guestIdentity } from "./guest-directory";
it("identical names without identifiers remain separate", () => {
  expect(guestIdentity({ id: "one" })).not.toBe(guestIdentity({ id: "two" }));
});
it("company tax identifier and normalized contact identify existing records", () => {
  expect(guestIdentity({ id: "one", vat: " DE123 ", company: true })).toBe("company:de123");
  expect(guestIdentity({ id: "two", email: " Guest@Example.com " })).toBe("email:guest@example.com");
});