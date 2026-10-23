/** Business wall-clock time; timestamps remain stored as UTC instants. */
export const BUSINESS_TIME_ZONE = "Europe/Berlin";

export function businessDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function businessTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/** Convert a Berlin wall clock into an instant, rejecting nonexistent DST times. */
export function berlinLocalToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("invalid_business_time");
  const desired = Date.parse(`${local}:00Z`);
  let instant = desired;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
    const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
    const wall = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
    if (wall === local) return new Date(instant).toISOString();
    instant += desired - Date.parse(`${wall}:00Z`);
  }
  throw new Error("invalid_business_time");
}

export function businessDayBounds(day: string): { start: string; end: string } {
  const midnight = (iso: string) => {
    const utc = Date.parse(`${iso}T00:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, timeZoneName: "longOffset" }).formatToParts(new Date(utc));
    const offset = parts.find(p => p.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!offset) throw new Error("business_timezone_offset_unavailable");
    const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
    return new Date(utc - minutes * 60000).toISOString();
  };
  const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { start: midnight(day), end: midnight(nextDay) };
}