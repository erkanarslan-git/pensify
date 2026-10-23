import { expect, it } from "vitest";
import { guestIdentity } from "./guest-directory";
it("identical names without identifiers remain separate", () => {
  expect(guestIdentity({ id: "one" })).not.toBe(guestIdentity({ id: "two" }));
});
it("only an existing booking relation groups multiple room stays", () => {
  expect(guestIdentity({id:"one",bookingId:"existing"})).toBe("booking:existing");
  expect(guestIdentity({id:"two",bookingId:"existing"})).toBe("booking:existing");
});
