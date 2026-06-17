import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Channel = Database["public"]["Enums"]["reservation_channel"];

export type EnqueueArgs = {
  channel: Channel;
  direction: "import" | "export";
  propertyId?: string | null;
  roomId?: string | null;
  integrationId?: string | null;
  payload?: Record<string, unknown>;
};

export async function enqueueSyncJob(args: EnqueueArgs) {
  const { error, data } = await supabase
    .from("sync_jobs")
    .insert({
      channel: args.channel,
      direction: args.direction,
      property_id: args.propertyId ?? null,
      room_id: args.roomId ?? null,
      integration_id: args.integrationId ?? null,
      payload: args.payload ?? {},
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Mock runner: marks pending jobs as success after a tiny delay. */
export async function runPendingSyncJobs() {
  const { data: jobs } = await supabase
    .from("sync_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  if (!jobs?.length) return 0;
  for (const j of jobs) {
    await supabase.from("sync_jobs").update({ status: "running", started_at: new Date().toISOString(), attempts: j.attempts + 1 }).eq("id", j.id);
    // Placeholder: real integration call would happen here.
    await supabase
      .from("sync_jobs")
      .update({
        status: "success",
        completed_at: new Date().toISOString(),
        result: { mock: true, processed_at: new Date().toISOString() },
      })
      .eq("id", j.id);
  }
  return jobs.length;
}

/** Fan-out helper: when a reservation changes locally, push to every enabled channel. */
export async function broadcastReservationChange(opts: {
  propertyId: string;
  roomId: string;
  reservationId: string;
  action: "create" | "update" | "cancel";
}) {
  const { data: integrations } = await supabase
    .from("channel_integrations")
    .select("id,channel,direction,enabled,property_id")
    .eq("property_id", opts.propertyId)
    .eq("enabled", true);
  if (!integrations?.length) return 0;
  let n = 0;
  for (const i of integrations) {
    if (i.direction === "import") continue;
    await enqueueSyncJob({
      channel: i.channel,
      direction: "export",
      propertyId: opts.propertyId,
      roomId: opts.roomId,
      integrationId: i.id,
      payload: { reservationId: opts.reservationId, action: opts.action },
    });
    n++;
  }
  return n;
}
