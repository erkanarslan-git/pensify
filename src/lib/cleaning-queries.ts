import type { QueryClient } from "@tanstack/react-query";

/** Re-read committed room states, including cached overviews, after a task transition. */
export async function refreshCleaningQueries(queryClient: QueryClient) {
  await Promise.all(
    ["cleaning-page", "dashboard", "notifications-live"].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key], refetchType: "all" }),
    ),
  );
}