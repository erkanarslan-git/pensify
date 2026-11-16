import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrg } from "./org-auth.server";
import { calendarWindow, collectReservationExport } from "./reservation-list";

export const loadOccupancyOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.number().int().min(1).max(372),
    propertyId: z.union([z.literal("all"), z.string().uuid()]),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { orgId } = await resolveActiveOrg(context.supabase);
    const { data: props, error } = await context.supabase.from("properties").select("id,name").eq("organization_id", orgId).order("name");
    if (error) throw new Error("overview_unavailable");
    const checked = await Promise.all((props ?? []).map(async (p) => {
      const r = await context.supabase.rpc("can_access_property", { _property: p.id });
      if (r.error) throw new Error("overview_unavailable");
      return r.data === true ? p : null;
    }));
    const ids = checked.filter((p): p is { id: string; name: string } => p !== null)
      .filter((p) => data.propertyId === "all" || p.id === data.propertyId).map((p) => p.id);
    if (!ids.length) return { totalRooms: 0, reservations: [] as { room_id: string; check_in: string; check_out: string }[] };
    const win = calendarWindow(data.start, data.days);
    const fetchAll = (query: () => any) => collectReservationExport<any>(async (offset, size) => {
      const result = await query().range(offset, offset + size - 1);
      if (result.error) throw new Error("overview_unavailable");
      return result.data ?? [];
    });
    const [rooms, reservations] = await Promise.all([
      fetchAll(() => context.supabase.from("rooms").select("id").eq("organization_id", orgId).in("property_id", ids).order("id")),
      fetchAll(() => context.supabase.from("reservations").select("room_id,check_in,check_out").eq("organization_id", orgId).in("property_id", ids)
        .is("deleted_at", null).not("status", "in", "(cancelled,no_show)").lt("check_in", win.end).gte("check_out", win.start).order("id")),
    ]);
    return { totalRooms: rooms.length, reservations: reservations as { room_id: string; check_in: string; check_out: string }[] };
  });
