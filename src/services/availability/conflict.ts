import { supabase } from "@/integrations/supabase/client";

export type ConflictCheck = {
  roomId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // exclusive
  ignoreId?: string;
};

/** Returns the overlapping reservation id, or null if room is free. */
export async function findConflict({ roomId, checkIn, checkOut, ignoreId }: ConflictCheck) {
  let q = supabase
    .from("reservations")
    .select("id,guest_name,check_in,check_out,channel,status")
    .eq("room_id", roomId)
    .neq("status", "cancelled")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);
  if (ignoreId) q = q.neq("id", ignoreId);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}
