import { describe, expect, it } from "vitest";
import { canDeleteTeamUser, deletionNameMatches } from "./team-safety";
import { ALL_ROLES } from "./permissions";

describe("careful team deletion", () => {
  it("requires the full person's name", () => {
    expect(deletionNameMatches("Erkan", "Erkan Arslan")).toBe(false);
    expect(deletionNameMatches("Erkan Arslan", "Erkan Arslan")).toBe(true);
    expect(deletionNameMatches("", "")).toBe(false);
  });
  it("allows only an owner to delete an administrator", () => {
    expect(canDeleteTeamUser("a", "b", "admin", "admin", 1, 0)).toBe(false);
    expect(canDeleteTeamUser("a", "b", "owner", "admin", 1, 0)).toBe(true);
  });
  it("protects self and the last owner", () => {
    expect(canDeleteTeamUser("a", "a", "owner", "owner", 2, 0)).toBe(false);
    expect(canDeleteTeamUser("a", "b", "owner", "owner", 1, 0)).toBe(false);
  });
  it("never deletes a person out of other organizations", () => {
    expect(canDeleteTeamUser("a", "b", "owner", "cleaner", 1, 1)).toBe(false);
  });
  it("keeps the built-in role catalog intact", () => {
    expect(ALL_ROLES).toEqual(["owner", "admin", "manager", "reception", "cleaner"]);
  });
});