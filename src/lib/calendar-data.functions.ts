import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrg } from "./org-auth.server";
import { businessDate } from "./business-time";
import { calendarWindow, collectReservationExport } from "./reservation-list";

export const loadCalendarData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.union([z.literal(7), z.literal(14), z.literal(30)]), propertyId: z.union([z.literal("all"), z.literal("first"), z.string().uuid()]) }).parse(data))
  .handler(async ({ data, context }) => {
    const { orgId } = await resolveActiveOrg(context.supabase);
    const { data: props, error } = await context.supabase.from("properties").select("id,name").eq("organization_id", orgId).order("name");
    if (error) throw new Error("calendar_unavailable");
    const checked = await Promise.all((props ?? []).map(async p => {
      const result = await context.supabase.rpc("can_access_property", { _property: p.id });
      if (result.error) throw new Error("calendar_unavailable");
      return result.data === true ? p : null;
    }));
    const properties = checked.filter((p): p is { id: string; name: string } => p !== null);
    // "first" keeps the initial calendar load to a single property.
    const ids = data.propertyId === "first" ? properties.slice(0, 1).map(p => p.id) : properties.filter(p => data.propertyId === "all" || p.id === data.propertyId).map(p => p.id);
    if (!ids.length) return { properties, rooms: [], reservations: [], tasks: [], todayReservations: [] };
    const window = calendarWindow(data.start, data.days);
    const today = businessDate();
    // Bounded requests avoid the Data API's 1000-row truncation.
    const fetchAll = (query: () => any) => collectReservationExport<any>(async (offset, size) => {
      const result = await query().range(offset, offset + size - 1);
      if (result.error) throw new Error("calendar_unavailable");
      return result.data ?? [];
    });
    const reservationBase = () => context.supabase.from("reservations").select("id,room_id,guest_name,channel,check_in,check_out,status")
      .eq("organization_id", orgId).in("property_id", ids).is("deleted_at", null).not("status", "in", "(cancelled,no_show)").order("id");
    const [rooms, reservations, tasks, todayReservations] = await Promise.all([
      fetchAll(() => context.supabase.from("rooms").select("id,number,property_id,floor,status").eq("organization_id", orgId).in("property_id", ids).order("floor", { ascending: true, nullsFirst: true }).order("number").order("id")),
      // Include checkout on the first visible day for the daily departure cards.
      fetchAll(() => reservationBase().lt("check_in", window.end).gte("check_out", window.start)),
      fetchAll(() => context.supabase.from("cleaning_tasks").select("room_id,status,notes").eq("organization_id", orgId).in("property_id", ids).in("status", ["pending", "in_progress", "problem"]).order("id")),
      fetchAll(() => context.supabase.from("reservations").select("id,room_id").eq("organization_id", orgId).in("property_id", ids).is("deleted_at", null).not("status", "in", "(cancelled,no_show)").lte("check_in", today).gt("check_out", today).order("id")),
    ]);
    // Payment state per reservation. RLS on payment_schedules/payments restricts
    // these reads to finance-powered users; everyone else gets no status line.
    const resIds = reservations.map(r => r.id);
    const paymentStates: Record<string, "paid" | "partial" | "open"> = {};
    if (resIds.length) {
      const [schedRes, payRes] = await Promise.all([
        context.supabase.from("payment_schedules").select("reservation_id,amount,kind").in("reservation_id", resIds),
        context.supabase.from("payments").select("reservation_id,amount,kind,reversed_at").in("reservation_id", resIds),
      ]);
      if (!schedRes.error && !payRes.error) {
        const totals = new Map<string, number>();
        const paidBy = new Map<string, number>();
        for (const s of (schedRes.data ?? []) as { reservation_id: string; amount: number | string; kind: string }[]) {
          if (s.kind !== "rent") continue;
          totals.set(s.reservation_id, (totals.get(s.reservation_id) ?? 0) + Number(s.amount));
        }
        for (const p of (payRes.data ?? []) as { reservation_id: string; amount: number | string; kind: string; reversed_at: string | null }[]) {
          if (p.reversed_at || p.kind === "deposit") continue;
          paidBy.set(p.reservation_id, (paidBy.get(p.reservation_id) ?? 0) + Number(p.amount));
        }
        for (const [id, total] of totals) {
          const paid = paidBy.get(id) ?? 0;
          paymentStates[id] = paid >= total - 0.005 ? "paid" : paid > 0 ? "partial" : "open";
        }
        for (const [id, paid] of paidBy) {
          if (!totals.has(id)) paymentStates[id] = "partial";
        }
      }
    }
    return { properties, rooms, reservations, tasks, todayReservations, paymentStates };
  });