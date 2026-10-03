// Deterministic color from a guest name. Same guest → same color across the calendar.
export function guestColor(name: string) {
  const key = (name || "").trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return {
    bg: `hsl(${hue} 65% 90%)`,
    fg: `hsl(${hue} 55% 22%)`,
    accent: `hsl(${hue} 60% 50%)`,
  };
}

// Active channels only: Booking, Airbnb, Check24, Web, Direct/Tel.
// Anything legacy (website/woocommerce/phone/walkin/ical/direct) collapses to one of these.
export const ACTIVE_CHANNELS = ["booking", "airbnb", "expedia", "check24", "website", "direct"] as const;
export type ActiveChannel = (typeof ACTIVE_CHANNELS)[number];

export function normalizeChannel(src: string): ActiveChannel {
  const s = (src || "").toLowerCase().trim();
  if (s === "booking" || s === "booking.com") return "booking";
  if (s === "airbnb") return "airbnb";
  if (s === "expedia") return "expedia";
  if (s === "check24") return "check24";
  if (s === "web" || s === "website" || s === "woocommerce" || s === "shop") return "website";
  return "direct"; // direct, phone, tel, walk-in, ical, unknown → Direkt/Tel
}

const DEFAULT_SOURCE_COLOR: Record<ActiveChannel, string> = {
  booking: "#003580",
  airbnb: "#ff5a5f",
  expedia: "#fbcc33",
  check24: "#005ea8",
  website: "#10b981",
  direct: "#f59e0b",
};
function readOverrides(): Partial<Record<ActiveChannel, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("pensify.channelColors");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
export function sourceColor(src: string): string {
  const ch = normalizeChannel(src);
  return readOverrides()[ch] ?? DEFAULT_SOURCE_COLOR[ch];
}

const SOURCE_LABEL: Record<ActiveChannel, string> = {
  booking: "Booking",
  airbnb: "Airbnb",
  expedia: "Expedia",
  check24: "Check24",
  website: "Web",
  direct: "Direkt/Tel",
};
export function sourceLabel(src: string): string {
  return SOURCE_LABEL[normalizeChannel(src)];
}
