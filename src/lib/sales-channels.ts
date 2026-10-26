export const SALES_CHANNELS = ["booking", "airbnb", "expedia", "website"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];
export type SyncMode = "manual" | "api";

export interface DistributionRoom {
  id: string;
  active: boolean;
  channel_sync_mode: SyncMode;
  sales_channels: string[];
}

/** Toggle one channel in a list, keeping the canonical channel order. */
export function toggleChannel(list: readonly string[], ch: SalesChannel): SalesChannel[] {
  const set = new Set(list);
  if (set.has(ch)) set.delete(ch); else set.add(ch);
  return SALES_CHANNELS.filter((c) => set.has(c));
}

/** Counts for the overview. Inactive rooms are never counted as for sale. */
export function summarizeDistribution(rooms: readonly DistributionRoom[]) {
  const active = rooms.filter((r) => r.active);
  const perChannel = Object.fromEntries(
    SALES_CHANNELS.map((c) => [c, active.filter((r) => r.sales_channels.includes(c)).length]),
  ) as Record<SalesChannel, number>;
  return {
    total: active.length,
    api: active.filter((r) => r.channel_sync_mode === "api").length,
    manual: active.filter((r) => r.channel_sync_mode !== "api").length,
    notListed: active.filter((r) => r.sales_channels.length === 0).length,
    perChannel,
  };
}
