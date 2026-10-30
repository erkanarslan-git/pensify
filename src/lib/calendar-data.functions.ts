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
    const reservationBase = () => context.supabase.from("reservations").select("id,room_id,guest_name,channel,check_in,check_out,status,property_id")
      .eq("organization_id", orgId).in("property_id", ids).is("deleted_at", null).not("status", "in", "(cancelled,no_show)").order("id");
    const [rooms, reservations, tasks, todayReservations] = await Promise.all([
      fetchAll(() => context.supabase.from("rooms").select("id,number,property_id,floor,status").eq("organization_id", orgId).in("property_id", ids).order("floor", { ascending: true, nullsFirst: true }).order("number").order("id")),
      // Include checkout on the first visible day for the daily departure cards.
      fetchAll(() => reservationBase().lt("check_in", window.end).gte("check_out", window.start)),
      // Only tasks due by today (Berlin): future checkout tasks are not "waiting" yet.
      fetchAll(() => context.supabase.from("cleaning_tasks").select("room_id,status,notes,due_at").eq("organization_id", orgId).in("property_id", ids).in("status", ["pending", "accepted", "in_progress", "problem"]).order("id")),
      fetchAll(() => context.supabase.from("reservations").select("id,room_id").eq("organization_id", orgId).in("property_id", ids).is("deleted_at", null).not("status", "in", "(cancelled,no_show)").lte("check_in", today).gt("check_out", today).order("id")),
    ]);
    const dueTasks = (tasks as { room_id: string; status: string; notes: string | null; due_at: string | null }[]).filter(t => !t.due_at || businessDate(new Date(t.due_at)) <= today);
    return { properties, rooms, reservations, tasks: dueTasks, todayReservations };
  });