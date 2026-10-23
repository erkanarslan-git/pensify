import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrg } from "./org-auth.server";
import { businessDate } from "./business-time";
import { applyReservationFilters, collectReservationExport, orderReservations, reservationFiltersSchema, reservationPageRange, reservationPageSchema, type ReservationFilters, type ReservationListRow } from "./reservation-list";

const columns: string = "id,guest_name,channel,status,check_in,check_out,guests_count,revenue,created_at,customer_type,company_name,room:rooms(number,property_id),property:properties(id,name)";

async function scope(client: any, filters: ReservationFilters) {
  const { orgId } = await resolveActiveOrg(client);
  const { data, error } = await client.from("properties").select("id,name").eq("organization_id", orgId).order("name");
  if (error) throw new Error("reservations_unavailable");
  const checks = await Promise.all((data ?? []).map(async (p: { id: string; name: string }) => {
    const { data: allowed, error: accessError } = await client.rpc("can_access_property", { _property: p.id });
    if (accessError) throw new Error("reservations_unavailable");
    return allowed === true ? p : null;
  }));
  const properties = checks.filter((p): p is { id: string; name: string } => p !== null);
  const ids = properties.filter(p => filters.propertyId === "all" || p.id === filters.propertyId).map(p => p.id);
  const roomIds: string[] = [];
  if (filters.search && ids.length) {
    // Matching room IDs are resolved within the same org/property scope.
    const pattern = filters.search.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
    for (let offset = 0; ; offset += 500) {
      const { data: rooms, error: roomError } = await client.from("rooms").select("id")
        .eq("organization_id", orgId).in("property_id", ids).ilike("number", `%${pattern}%`).order("id").range(offset, offset + 499);
      if (roomError) throw new Error("reservations_unavailable");
      roomIds.push(...(rooms ?? []).map((r: { id: string }) => r.id));
      if ((rooms?.length ?? 0) < 500) break;
    }
  }
  return { orgId, ids, properties, roomIds, today: businessDate() };
}

export const listReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reservationPageSchema.parse(data))
  .handler(async ({ data, context }) => {
    const s = await scope(context.supabase, data);
    if (!s.ids.length) return { rows: [] as ReservationListRow[], total: 0, page: 0, properties: s.properties, stats: { arrivals: 0, departures: 0, staying: 0 } };
    const base = () => context.supabase.from("reservations").select(columns, { count: "exact" })
      .eq("organization_id", s.orgId).in("property_id", s.ids);
    const filtered = () => applyReservationFilters(base(), data, s.today, s.roomIds);
    const [from, to] = reservationPageRange(data.page, data.pageSize);
    let result = await orderReservations(filtered(), data.sort).range(from, to).returns<ReservationListRow[]>();
    if (result.error) throw new Error("reservations_unavailable");
    const total = result.count ?? 0;
    const page = Math.min(data.page, Math.max(0, Math.ceil(total / data.pageSize) - 1));
    if (page !== data.page) {
      const [first, last] = reservationPageRange(page, data.pageSize);
      result = await orderReservations(filtered(), data.sort).range(first, last).returns<ReservationListRow[]>();
      if (result.error) throw new Error("reservations_unavailable");
    }
    const countBase = () => applyReservationFilters(context.supabase.from("reservations")
      .select("id", { count: "exact", head: true }).eq("organization_id", s.orgId).in("property_id", s.ids), data, s.today, s.roomIds)
      .not("status", "in", "(cancelled,no_show)");
    const counts = await Promise.all([
      countBase().eq("check_in", s.today), countBase().eq("check_out", s.today),
      countBase().lte("check_in", s.today).gt("check_out", s.today),
    ]);
    if (counts.some(c => c.error)) throw new Error("reservations_unavailable");
    return { rows: result.data ?? [], total, page, properties: s.properties,
      stats: { arrivals: counts[0]?.count ?? 0, departures: counts[1]?.count ?? 0, staying: counts[2]?.count ?? 0 } };
  });

export const exportReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reservationFiltersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const s = await scope(context.supabase, data);
    if (!s.ids.length) return [] as ReservationListRow[];
    return collectReservationExport<ReservationListRow>(async (offset, size) => {
      const query = applyReservationFilters(context.supabase.from("reservations").select(columns)
        .eq("organization_id", s.orgId).in("property_id", s.ids), data, s.today, s.roomIds);
      const { data: rows, error } = await orderReservations(query, data.sort).range(offset, offset + size - 1).returns<ReservationListRow[]>();
      if (error) throw new Error("reservations_unavailable");
      return rows ?? [];
    });
  });