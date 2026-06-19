// Deterministic color from a guest name. Same guest → same color across the calendar.
// Returns a soft pastel background + readable foreground + saturated accent.
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

// Map any source/channel string → a strong color used for the left source stripe.
const SOURCE_COLOR: Record<string, string> = {
  airbnb: "#ff5a5f",
  "booking.com": "#003580",
  booking: "#003580",
  check24: "#005ea8",
  website: "#10b981",
  woocommerce: "#7f54b3",
  phone: "#f59e0b",
  "walk-in": "#6b7280",
  walkin: "#6b7280",
  direct: "#0ea5e9",
  ical: "#94a3b8",
};
export function sourceColor(src: string): string {
  return SOURCE_COLOR[(src || "").toLowerCase()] ?? "#64748b";
}

// Short, friendly label like "Booking" / "Airbnb" / "Phone"
export function sourceLabel(src: string): string {
  const s = (src || "").toLowerCase();
  if (s === "booking" || s === "booking.com") return "Booking";
  if (s === "airbnb") return "Airbnb";
  if (s === "check24") return "Check24";
  if (s === "website") return "Web";
  if (s === "woocommerce") return "Shop";
  if (s === "phone") return "Tel";
  if (s === "walk-in" || s === "walkin") return "Walk-in";
  if (s === "direct") return "Direct";
  if (s === "ical") return "iCal";
  return src;
}
