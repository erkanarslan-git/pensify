import { describe, expect, it, vi } from "vitest";

const rows = [
  { id: "active", revoked_at: null },
  { id: "temporary", revoked_at: "2026-10-23T02:00:00Z" },
];
const state = vi.hoisted(() => ({ filter: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({
    is: (column: string, value: unknown) => {
      state.filter(column, value);
      return { order: async () => ({ data: rows.filter(row => row.revoked_at === value), error: null }) };
    },
  }) }) },
}));
import { loadActiveTvDisplays } from "./tv-displays";

describe("Active TV links", () => {
  it("excludes revoked temporary links in the database query", async () => {
    const result = await loadActiveTvDisplays();
    expect(state.filter).toHaveBeenCalledWith("revoked_at", null);
    expect(result?.map(row => row.id)).toEqual(["active"]);
  });
});