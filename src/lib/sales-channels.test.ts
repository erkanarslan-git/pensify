import { describe, expect, it } from "vitest";
import { summarizeDistribution, toggleChannel } from "./sales-channels";

describe("sales channels", () => {
  it("toggles a channel and keeps canonical order", () => {
    expect(toggleChannel(["expedia"], "booking")).toEqual(["booking", "expedia"]);
    expect(toggleChannel(["booking", "expedia"], "booking")).toEqual(["expedia"]);
  });
  it("counts API vs manual rooms and skips inactive rooms", () => {
    const s = summarizeDistribution([
      { id: "1", active: true, channel_sync_mode: "api", sales_channels: ["booking", "airbnb"] },
      { id: "2", active: true, channel_sync_mode: "manual", sales_channels: [] },
      { id: "3", active: false, channel_sync_mode: "api", sales_channels: ["booking"] },
    ]);
    expect(s).toMatchObject({ total: 2, api: 1, manual: 1, notListed: 1 });
    expect(s.perChannel.booking).toBe(1);
  });
});
