import { describe, expect, it } from "vitest";
import { canAccessRoute } from "./permissions";
import { RESERVATION_TRASH_RETENTION_DAYS, reservationActionReason, reservationPurgeAllowed } from "./reservation-actions";

describe("reservation cancellation and deletion", () => {
  it("requires a non-empty reason and trims it", () => {
    expect(reservationActionReason(null)).toBeNull();
    expect(reservationActionReason("   ")).toBeNull();
    expect(reservationActionReason("  Falsches Zimmer  ")).toBe("Falsches Zimmer");
  });

  it("allows permanent deletion only after 30 full days", () => {
    expect(RESERVATION_TRASH_RETENTION_DAYS).toBe(30);
    const deletedAt = new Date("2026-11-01T12:00:00Z");
    const purgeAt = new Date(deletedAt.getTime() + RESERVATION_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    expect(reservationPurgeAllowed(purgeAt, new Date(new Date(purgeAt).getTime() - 1))).toBe(false);
    expect(reservationPurgeAllowed(purgeAt, new Date(purgeAt))).toBe(true);
  });

  it("lets only an explicitly authorized lead open the reservation trash", () => {
    expect(canAccessRoute("/settings/trash", ["manager"], [], false, () => false)).toBe(false);
    expect(canAccessRoute("/settings/trash", ["manager"], [], false, (key) => key === "delete_reservation")).toBe(true);
    expect(canAccessRoute("/settings/trash", ["reception"], [], false, () => false)).toBe(false);
  });
});
