import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// Helpers ------------------------------------------------------------

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function overlapNights(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  return Math.max(0, daysBetween(s, e));
}

async function fetchRooms(supabase: SupabaseClient, propertyId?: string) {
  let q = supabase.from("rooms").select("id, number, capacity, property_id, properties:property_id(name)");
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data, error } = await q;
  if (error) throw new Error(`Odalar okunamadı: ${error.message}`);
  return data ?? [];
}

async function fetchReservations(
  supabase: SupabaseClient,
  from: string,
  to: string,
  propertyId?: string,
) {
  // Overlapping any reservation with the window and not cancelled.
  let q = supabase
    .from("reservations")
    .select("id, room_id, property_id, check_in, check_out, revenue, channel, status, guest_name")
    .neq("status", "cancelled")
    .lt("check_in", to)
    .gt("check_out", from);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data, error } = await q;
  if (error) throw new Error(`Rezervasyonlar okunamadı: ${error.message}`);
  return data ?? [];
}

// Tools --------------------------------------------------------------

export function buildAiTools(supabase: SupabaseClient) {
  return {
    list_properties: tool({
      description:
        "Kullanıcının pansiyonlarını listeler. Oda/pansiyon adı geçen sorularda önce bunu çağır ki id eşleştirmesi yapabilesin.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("properties")
          .select("id, name, address, city_id")
          .order("name");
        if (error) return { error: error.message, properties: [] };
        return { properties: data ?? [] };
      },
    }),

    list_rooms: tool({
      description: "Odaları listeler. İsteğe bağlı pansiyon filtresi.",
      inputSchema: z.object({
        propertyId: z.string().nullable().describe("Opsiyonel pansiyon id"),
      }),
      execute: async ({ propertyId }) => {
        const rooms = await fetchRooms(supabase, propertyId ?? undefined);
        return {
          rooms: rooms.map((r: any) => ({
            id: r.id,
            number: r.number,
            capacity: r.capacity,
            property: r.properties?.name,
          })),
        };
      },
    }),

    check_room_availability: tool({
      description:
        "Verilen tarih aralığında (from dahil, to hariç) belirli bir odanın veya oda numarasının müsait olup olmadığını söyler.",
      inputSchema: z.object({
        roomNumber: z.string().nullable().describe("Oda numarası, örn '3'. Yoksa roomId ver."),
        roomId: z.string().nullable().describe("UUID. roomNumber verildiyse boş bırak."),
        propertyName: z.string().nullable().describe("Aynı numaralı birden çok pansiyon varsa"),
        from: z.string().describe("Başlangıç tarihi YYYY-MM-DD"),
        to: z.string().describe("Bitiş tarihi YYYY-MM-DD (dahil değil)"),
      }),
      execute: async ({ roomNumber, roomId, propertyName, from, to }) => {
        const rooms = await fetchRooms(supabase);
        let candidates = rooms;
        if (roomId) candidates = rooms.filter((r: any) => r.id === roomId);
        else if (roomNumber) candidates = rooms.filter((r: any) => String(r.number) === String(roomNumber));
        if (propertyName)
          candidates = candidates.filter((r: any) =>
            (r.properties?.name ?? "").toLowerCase().includes(propertyName.toLowerCase()),
          );
        if (candidates.length === 0) return { found: false, reason: "Oda bulunamadı" };

        const results = [];
        for (const r of candidates) {
          const res = await fetchReservations(supabase, from, to);
          const conflicts = res.filter((x: any) => x.room_id === r.id);
          results.push({
            roomId: r.id,
            number: r.number,
            property: (r as any).properties?.name,
            available: conflicts.length === 0,
            conflictingReservations: conflicts.map((c: any) => ({
              check_in: c.check_in,
              check_out: c.check_out,
              guest: c.guest_name,
              channel: c.channel,
            })),
          });
        }
        return { found: true, results };
      },
    }),

    list_free_rooms: tool({
      description: "Belirtilen tarih aralığında müsait tüm odaları listeler.",
      inputSchema: z.object({
        from: z.string().describe("YYYY-MM-DD"),
        to: z.string().describe("YYYY-MM-DD"),
        propertyId: z.string().nullable(),
      }),
      execute: async ({ from, to, propertyId }) => {
        const rooms = await fetchRooms(supabase, propertyId ?? undefined);
        const res = await fetchReservations(supabase, from, to, propertyId ?? undefined);
        const busy = new Set(res.map((r: any) => r.room_id));
        const free = rooms.filter((r: any) => !busy.has(r.id));
        return {
          from,
          to,
          totalRooms: rooms.length,
          freeCount: free.length,
          rooms: free.map((r: any) => ({
            id: r.id,
            number: r.number,
            capacity: r.capacity,
            property: (r as any).properties?.name,
          })),
        };
      },
    }),

    occupancy_stats: tool({
      description:
        "Doluluk oranını hesaplar. Aylık gruplama için groupBy='month', pansiyon bazında için 'property', toplam için 'total'.",
      inputSchema: z.object({
        from: z.string().describe("YYYY-MM-DD"),
        to: z.string().describe("YYYY-MM-DD"),
        groupBy: z.enum(["month", "property", "total"]),
        propertyId: z.string().nullable(),
      }),
      execute: async ({ from, to, groupBy, propertyId }) => {
        const rooms = await fetchRooms(supabase, propertyId ?? undefined);
        const roomCount = rooms.length;
        if (roomCount === 0) return { error: "Oda yok" };
        const res = await fetchReservations(supabase, from, to, propertyId ?? undefined);
        const totalDays = daysBetween(from, to);

        if (groupBy === "total") {
          let nights = 0;
          for (const r of res) nights += overlapNights(r.check_in, r.check_out, from, to);
          return {
            from,
            to,
            roomCount,
            totalRoomNights: roomCount * totalDays,
            bookedNights: nights,
            occupancyPct: totalDays ? +((nights / (roomCount * totalDays)) * 100).toFixed(1) : 0,
          };
        }

        if (groupBy === "property") {
          const byProp = new Map<string, { name: string; nights: number; rooms: number }>();
          const propRooms = new Map<string, number>();
          for (const r of rooms as any[]) {
            propRooms.set(r.property_id, (propRooms.get(r.property_id) ?? 0) + 1);
          }
          for (const r of res) {
            const nights = overlapNights(r.check_in, r.check_out, from, to);
            const propName = (rooms as any[]).find((x) => x.id === r.room_id)?.properties?.name ?? "?";
            const cur = byProp.get(r.property_id) ?? { name: propName, nights: 0, rooms: propRooms.get(r.property_id) ?? 0 };
            cur.nights += nights;
            byProp.set(r.property_id, cur);
          }
          return {
            from,
            to,
            totalDays,
            properties: Array.from(byProp.entries()).map(([id, v]) => ({
              propertyId: id,
              name: v.name,
              rooms: v.rooms,
              bookedNights: v.nights,
              occupancyPct: v.rooms && totalDays ? +((v.nights / (v.rooms * totalDays)) * 100).toFixed(1) : 0,
            })),
          };
        }

        // month
        const monthNights = new Map<string, number>();
        for (const r of res) {
          const cIn = new Date(r.check_in);
          const cOut = new Date(r.check_out);
          const s = new Date(Math.max(cIn.getTime(), new Date(from).getTime()));
          const e = new Date(Math.min(cOut.getTime(), new Date(to).getTime()));
          for (let d = new Date(s); d < e; d.setUTCDate(d.getUTCDate() + 1)) {
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            monthNights.set(key, (monthNights.get(key) ?? 0) + 1);
          }
        }
        const months = Array.from(monthNights.entries()).sort().map(([k, nights]) => {
          const [y, m] = k.split("-").map(Number);
          const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const cap = roomCount * dim;
          return { month: k, bookedNights: nights, capacity: cap, occupancyPct: +((nights / cap) * 100).toFixed(1) };
        });
        return { from, to, roomCount, months };
      },
    }),

    revenue_stats: tool({
      description:
        "Ciro istatistikleri. groupBy='month'|'channel'|'property'|'total'. Rezervasyonların 'revenue' alanı üzerinden.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        groupBy: z.enum(["month", "channel", "property", "total"]),
        propertyId: z.string().nullable(),
      }),
      execute: async ({ from, to, groupBy, propertyId }) => {
        const res = await fetchReservations(supabase, from, to, propertyId ?? undefined);
        const rooms = await fetchRooms(supabase);
        const propName = new Map<string, string>();
        for (const r of rooms as any[]) propName.set(r.property_id, r.properties?.name ?? "?");

        if (groupBy === "total") {
          const revenue = res.reduce((s: number, r: any) => s + Number(r.revenue ?? 0), 0);
          return { from, to, reservations: res.length, revenue: +revenue.toFixed(2) };
        }
        const buckets = new Map<string, number>();
        const counts = new Map<string, number>();
        for (const r of res) {
          let key = "?";
          if (groupBy === "month") key = r.check_in.slice(0, 7);
          else if (groupBy === "channel") key = r.channel;
          else if (groupBy === "property") key = propName.get(r.property_id) ?? "?";
          buckets.set(key, (buckets.get(key) ?? 0) + Number(r.revenue ?? 0));
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return {
          from,
          to,
          groups: Array.from(buckets.entries())
            .sort()
            .map(([k, v]) => ({ key: k, revenue: +v.toFixed(2), reservations: counts.get(k) ?? 0 })),
        };
      },
    }),

    cleaning_workload: tool({
      description: "Belirli tarih aralığında pansiyon başına planlanan/tamamlanan temizlik sayısı.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
      }),
      execute: async ({ from, to }) => {
        const { data } = await supabase
          .from("cleaning_tasks")
          .select("id, status, property_id, due_at, properties:property_id(name)")
          .gte("due_at", `${from}T00:00:00Z`)
          .lte("due_at", `${to}T23:59:59Z`);
        const byProp = new Map<string, { name: string; total: number; completed: number; pending: number; problem: number }>();
        for (const t of (data as any[]) ?? []) {
          const name = t.properties?.name ?? "?";
          const cur = byProp.get(t.property_id) ?? { name, total: 0, completed: 0, pending: 0, problem: 0 };
          cur.total += 1;
          if (t.status === "completed") cur.completed += 1;
          else if (t.status === "problem") cur.problem += 1;
          else cur.pending += 1;
          byProp.set(t.property_id, cur);
        }
        return {
          from,
          to,
          properties: Array.from(byProp.entries()).map(([id, v]) => ({ propertyId: id, ...v })),
        };
      },
    }),

    yearly_review: tool({
      description:
        "Bir yılın tam değerlendirmesi: aylık doluluk, aylık ciro, kanal dağılımı, en iyi/ en zayıf aylar.",
      inputSchema: z.object({
        year: z.number().int().min(2000).max(2100),
      }),
      execute: async ({ year }) => {
        const from = `${year}-01-01`;
        const to = `${year + 1}-01-01`;
        const rooms = await fetchRooms(supabase);
        const res = await fetchReservations(supabase, from, to);
        const monthly = new Map<string, { nights: number; revenue: number; reservations: number }>();
        for (const r of res) {
          const cIn = new Date(Math.max(new Date(r.check_in).getTime(), new Date(from).getTime()));
          const cOut = new Date(Math.min(new Date(r.check_out).getTime(), new Date(to).getTime()));
          const nights = Math.max(0, Math.round((cOut.getTime() - cIn.getTime()) / 86400000));
          for (let d = new Date(cIn); d < cOut; d.setUTCDate(d.getUTCDate() + 1)) {
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            const cur = monthly.get(key) ?? { nights: 0, revenue: 0, reservations: 0 };
            cur.nights += 1;
            monthly.set(key, cur);
          }
          const monthKey = r.check_in.slice(0, 7);
          const cur = monthly.get(monthKey) ?? { nights: 0, revenue: 0, reservations: 0 };
          cur.revenue += Number(r.revenue ?? 0);
          cur.reservations += 1;
          monthly.set(monthKey, cur);
          void nights;
        }
        const months = Array.from({ length: 12 }, (_, i) => {
          const key = `${year}-${String(i + 1).padStart(2, "0")}`;
          const v = monthly.get(key) ?? { nights: 0, revenue: 0, reservations: 0 };
          const dim = new Date(Date.UTC(year, i + 1, 0)).getUTCDate();
          const cap = rooms.length * dim;
          return {
            month: key,
            bookedNights: v.nights,
            capacity: cap,
            occupancyPct: cap ? +((v.nights / cap) * 100).toFixed(1) : 0,
            revenue: +v.revenue.toFixed(2),
            reservations: v.reservations,
          };
        });
        const channelMap = new Map<string, { revenue: number; reservations: number }>();
        for (const r of res) {
          const c = channelMap.get(r.channel) ?? { revenue: 0, reservations: 0 };
          c.revenue += Number(r.revenue ?? 0);
          c.reservations += 1;
          channelMap.set(r.channel, c);
        }
        return {
          year,
          totalRooms: rooms.length,
          totalReservations: res.length,
          totalRevenue: +res.reduce((s: number, r: any) => s + Number(r.revenue ?? 0), 0).toFixed(2),
          months,
          channels: Array.from(channelMap.entries()).map(([k, v]) => ({
            channel: k,
            revenue: +v.revenue.toFixed(2),
            reservations: v.reservations,
          })),
        };
      },
    }),
  };
}
