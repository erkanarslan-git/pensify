import { supabase } from "@/integrations/supabase/client";

export async function loadActiveTvDisplays(signal?: AbortSignal) {
  const query = supabase.from("tv_displays")
    .select("id,name,created_at,revoked_at,rotation_seconds")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
  return data;
}