import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { refreshCleaningQueries } from "./cleaning-queries";
import { summarizeRooms } from "./room-summary";

describe("cleaning completion refresh", () => {
  it("moves a finished room from yellow to available even while the overview is unmounted", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    let status = "cleaning_in_progress";
    const query = {
      queryKey: ["dashboard"],
      queryFn: async () => ({ rooms: [{ status }] }),
      staleTime: Infinity,
    };
    await client.fetchQuery(query);
    expect(summarizeRooms(client.getQueryData<{ rooms: { status: string }[] }>(["dashboard"])?.rooms ?? []).cleaning).toBe(1);

    status = "cleaned";
    await refreshCleaningQueries(client);
    const summary = summarizeRooms(client.getQueryData<{ rooms: { status: string }[] }>(["dashboard"])?.rooms ?? []);
    expect(summary.available).toBe(1);
    expect(summary.cleaning).toBe(0);
    expect(summary.total).toBe(1);
    client.clear();
  });

  it("refreshes the task list and dated action center after the committed transition", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    let status = "in_progress";
    for (const queryKey of [["cleaning-page"], ["notifications-live", "2026-10-22"]]) {
      await client.fetchQuery({ queryKey, queryFn: async () => status, staleTime: Infinity });
    }
    status = "completed";
    await refreshCleaningQueries(client);
    expect(client.getQueryData(["cleaning-page"])).toBe("completed");
    expect(client.getQueryData(["notifications-live", "2026-10-22"])).toBe("completed");
    client.clear();
  });
});