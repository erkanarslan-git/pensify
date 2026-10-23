import { z } from "zod";
import { businessDayBounds } from "./business-time";

export const RESERVATION_PAGE_SIZES = [10, 20, 30, 40, 50] as const;
export const reservationFiltersSchema = z.object({
  search: z.string().trim().max(120).default(""),
  propertyId: z.union([z.literal("all"), z.string().uuid()]).default("all"),
  source: z.enum(["all", "booking", "airbnb", "expedia", "check24", "website", "direct"]).default("all"),
  status: z.enum(["all", "confirmed", "tentative", "checked_in", "checked_out", "cancelled", "no_show"]).default("all"),
  period: z.enum(["upcoming", "today", "past", "all"]).default("upcoming"),
  createdTodayOnly: z.boolean().default(false),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  sort: z.enum(["arrivalAsc", "arrivalDesc", "createdDesc"]).default("arrivalAsc"),
});
export const reservationPageSchema = reservationFiltersSchema.extend({
  page: z.number().int().min(0).max(1_000_000).default(0),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50)]).default(20),
});
export type ReservationFilters = z.infer<typeof reservationFiltersSchema>;
export type ReservationPage = z.infer<typeof reservationPageSchema>;
export interface ReservationListRow {
  id: string; guest_name: string; channel: string; status: string;
  check_in: string; check_out: string; guests_count: number; revenue: number; created_at: string;
  customer_type: string | null; company_name: string | null;
  room: { number: string; property_id: string } | null;
  property: { id: string; name: string } | null;
}
export const reservationChannels = {
  booking: ["booking"], airbnb: ["airbnb"], expedia: ["expedia"], check24: ["check24"],
  website: ["website", "woocommerce"], direct: ["direct", "phone", "walkin", "ical"],
} as const;

// Escape both PostgREST grammar and LIKE wildcards; searches are literal text.
export function reservationSearchPattern(value: string) {
  const literal = value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&").replace(/"/g, '\\"');
  return `"%${literal}%"`;
}

export function applyReservationFilters<T>(query: T, filters: ReservationFilters, today: string, roomIds: string[] = []): T {
  // Supabase's fluent builder has different result types for count and row queries.
  let q: any = query;
  q = q.is("deleted_at", null);
  if (filters.propertyId !== "all") q = q.eq("property_id", filters.propertyId);
  if (filters.source !== "all") q = q.in("channel", reservationChannels[filters.source]);
  if (filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.period === "upcoming") q = q.gte("check_out", today);
  if (filters.period === "today") q = q.lte("check_in", today).gte("check_out", today);
  if (filters.period === "past") q = q.lt("check_out", today);
  if (filters.from) q = q.gte("check_in", filters.from);
  if (filters.to) q = q.lte("check_in", filters.to);
  if (filters.createdTodayOnly) {
    const bounds = businessDayBounds(today);
    q = q.gte("created_at", bounds.start).lt("created_at", bounds.end);
  }
  if (filters.search) {
    const pattern = reservationSearchPattern(filters.search);
    const roomFilter = roomIds.length ? `,room_id.in.(${roomIds.join(",")})` : "";
    q = q.or(`guest_name.ilike.${pattern},company_name.ilike.${pattern}${roomFilter}`);
  }
  return q;
}

export function orderReservations<T>(query: T, sort: ReservationFilters["sort"]): T {
  const q: any = query;
  return q.order(sort === "createdDesc" ? "created_at" : "check_in", { ascending: sort === "arrivalAsc" }).order("id", { ascending: true });
}

export function reservationPageRange(page: number, size: number): [number, number] {
  return [page * size, page * size + size - 1];
}

export async function collectReservationExport<T>(fetchPage: (offset: number, size: number) => Promise<T[]>, size = 500) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const chunk = await fetchPage(offset, size);
    rows.push(...chunk);
    if (chunk.length < size) return rows;
  }
}

export function reservationCsvCell(value: unknown): string {
  const text = String(value ?? "");
  // Prevent spreadsheet formula execution as well as commas/newline corruption.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function calendarWindow(start: string, days: number) {
  return { start, end: new Date(Date.parse(`${start}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10) };
}