import type { ActiveChannel } from "./guest-color";

export const DEFAULT_CHANNEL_COLORS: Record<ActiveChannel, string> = {
  booking: "#003580",
  airbnb: "#ff5a5f",
  expedia: "#fbcc33",
  check24: "#005ea8",
  website: "#10b981",
  direct: "#f59e0b",
};

const STORAGE_KEY = "pensify.channelColors";

export function loadChannelColors(): Record<ActiveChannel, string> {
  if (typeof window === "undefined") return DEFAULT_CHANNEL_COLORS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CHANNEL_COLORS;
    return { ...DEFAULT_CHANNEL_COLORS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CHANNEL_COLORS;
  }
}

export function saveChannelColors(colors: Record<ActiveChannel, string>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  window.dispatchEvent(new Event("pensify:channel-colors-changed"));
}
