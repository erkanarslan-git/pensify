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
export const ACTIVE_CHANNELS = ["booking", "airbnb", "check24", "web", "direct"] as const;
export type ActiveChannel = (typeof ACTIVE_CHANNELS)[number];

export function normalizeChannel(src: string): ActiveChannel {
  const s = (src || "").toLowerCase().trim();
  if (s === "booking" || s === "booking.com") return "booking";
  if (s === "airbnb") return "airbnb";
  if (s === "check24") return "check24";
  if (s === "web" || s === "website" || s === "woocommerce" || s === "shop") return "web";
  return "direct"; // direct, phone, tel, walk-in, ical, unknown → Direct/Tel
}

const SOURCE_COLOR: Record<ActiveChannel, string> = {
  booking: "#003580",
  airbnb: "#ff5a5f",
  check24: "#005ea8",
  web: "#10b981",
  direct: "#f59e0b",
};
export function sourceColor(src: string): string {
  return SOURCE_COLOR[normalizeChannel(src)];
}

const SOURCE_LABEL: Record<ActiveChannel, string> = {
  booking: "Booking",
  airbnb: "Airbnb",
  check24: "Check24",
  web: "Web",
  direct: "Direkt/Tel",
};
export function sourceLabel(src: string): string {
  return SOURCE_LABEL[normalizeChannel(src)];
}
