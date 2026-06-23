import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PUBLIC_BASE = "https://project--c3bce140-98e6-40ed-a35c-6ad0fa40d481.lovable.app";

type SettingsMap = Record<string, any>;

async function loadSettings(supabase: any): Promise<SettingsMap> {
  const { data } = await supabase.from("app_settings").select("key,value");
  const m: SettingsMap = {};
  for (const r of data ?? []) m[r.key] = r.value;
  return m;
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  const { data: owner } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" });
  if (!data && !owner) throw new Error("Forbidden");
}

function todayISO(tz: string): string {
  // YYYY-MM-DD in given TZ
  const d = new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function renderMessage(template: string, cleanerName: string, items: { propertyName: string; roomNumber: string; link: string }[]) {
  const liste = items
    .map((it, i) => `${i + 1}. ${it.propertyName} - Oda ${it.roomNumber}\n   ${it.link}`)
    .join("\n\n");
  return template
    .replaceAll("{ad}", cleanerName)
    .replaceAll("{N}", String(items.length))
    .replaceAll("{liste}", liste);
}

async function buildAndSendForCleaner(
  supabase: any,
  cleanerId: string,
  scheduledFor: string,
  trigger: "auto" | "manual" | "resend",
  template: string,
  sentBy: string | null,
) {
  // get cleaner
  const { data: cleaner } = await supabase
    .from("cleaners")
    .select("id, full_name, phone, active")
    .eq("id", cleanerId)
    .maybeSingle();
  if (!cleaner || !cleaner.active) return { cleanerId, skipped: true, reason: "inactive" };

  // tasks for that cleaner due that day (open)
  const dayStart = `${scheduledFor}T00:00:00Z`;
  const dayEnd = `${scheduledFor}T23:59:59Z`;
  const { data: tasks } = await supabase
    .from("cleaning_tasks")
    .select("id, room_id, property_id, status, due_at, rooms:room_id (number), properties:property_id (name, qr_token)")
    .eq("cleaner_id", cleanerId)
    .in("status", ["pending", "accepted", "in_progress"])
    .gte("due_at", dayStart)
    .lte("due_at", dayEnd)
    .order("due_at", { ascending: true });

  if (!tasks || tasks.length === 0) return { cleanerId, skipped: true, reason: "no_tasks" };

  const items = tasks.map((t: any) => ({
    propertyName: t.properties?.name ?? "—",
    roomNumber: t.rooms?.number ?? "—",
    link: t.properties?.qr_token ? `${PUBLIC_BASE}/clock/${t.properties.qr_token}` : `${PUBLIC_BASE}/me`,
  }));
  const body = renderMessage(template, cleaner.full_name ?? "", items);

  const { error } = await supabase.from("dispatch_messages").insert({
    cleaner_id: cleanerId,
    scheduled_for: scheduledFor,
    trigger,
    task_ids: tasks.map((t: any) => t.id),
    body,
    status: "sent",
    provider: "simulation",
    sent_by: sentBy,
  });
  if (error) throw error;
  return { cleanerId, sent: true, count: tasks.length };
}

// ---------------- Server fns ----------------

export const dispatchMorningTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cleanerIds?: string[]; trigger?: "auto" | "manual" | "resend" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const settings = await loadSettings(context.supabase);
    const tz = (settings["dispatch.timezone"] as string) || "Europe/Istanbul";
    const template = (settings["dispatch.message_template"] as string) || "Günaydın {ad}!\n{liste}";
    const scheduledFor = todayISO(tz);

    let cleanerIds = data.cleanerIds;
    if (!cleanerIds || cleanerIds.length === 0) {
      const { data: rows } = await context.supabase.from("cleaners").select("id").eq("active", true);
      cleanerIds = (rows ?? []).map((r: any) => r.id);
    }

    const results: any[] = [];
    for (const id of cleanerIds) {
      try {
        results.push(await buildAndSendForCleaner(context.supabase, id, scheduledFor, data.trigger ?? "manual", template, context.userId));
      } catch (e: any) {
        results.push({ cleanerId: id, error: e.message });
      }
    }
    return { scheduledFor, results };
  });

export const getTodayDispatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const settings = await loadSettings(context.supabase);
    const tz = (settings["dispatch.timezone"] as string) || "Europe/Istanbul";
    const scheduledFor = todayISO(tz);
    const dayStart = `${scheduledFor}T00:00:00Z`;
    const dayEnd = `${scheduledFor}T23:59:59Z`;

    const { data: cleaners } = await context.supabase
      .from("cleaners")
      .select("id, full_name, phone, active")
      .eq("active", true)
      .order("full_name");

    const { data: tasks } = await context.supabase
      .from("cleaning_tasks")
      .select("id, cleaner_id, status, room_id, property_id, rooms:room_id (number), properties:property_id (name)")
      .gte("due_at", dayStart)
      .lte("due_at", dayEnd);

    const { data: messages } = await context.supabase
      .from("dispatch_messages")
      .select("id, cleaner_id, sent_at, trigger, task_ids, body, status")
      .eq("scheduled_for", scheduledFor)
      .order("sent_at", { ascending: false });

    return { scheduledFor, settings, cleaners: cleaners ?? [], tasks: tasks ?? [], messages: messages ?? [] };
  });

export const simulateReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cleanerId: string; text: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const settings = await loadSettings(context.supabase);
    const tz = (settings["dispatch.timezone"] as string) || "Europe/Istanbul";
    const scheduledFor = todayISO(tz);

    const match = data.text.trim().match(/^([12])\s+(\d+)/);
    let parsed: "start" | "end" | "unknown" = "unknown";
    let taskId: string | null = null;
    let applied = false;
    let applyError: string | null = null;

    if (match) {
      parsed = match[1] === "1" ? "start" : "end";
      const idx = parseInt(match[2], 10) - 1;
      const { data: msg } = await context.supabase
        .from("dispatch_messages")
        .select("id, task_ids")
        .eq("cleaner_id", data.cleanerId)
        .eq("scheduled_for", scheduledFor)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (msg && msg.task_ids && msg.task_ids[idx]) {
        taskId = msg.task_ids[idx];
        const { data: task } = await context.supabase
          .from("cleaning_tasks")
          .select("id, property_id, cleaner_id, status")
          .eq("id", taskId)
          .maybeSingle();
        if (task && task.cleaner_id) {
          const cleanerIdNN: string = task.cleaner_id;
          try {
            if (parsed === "start") {
              // open shift if none
              const { data: openShift } = await context.supabase
                .from("time_entries")
                .select("id")
                .eq("cleaner_id", task.cleaner_id)
                .is("clock_out_at", null)
                .maybeSingle();
              if (!openShift) {
                const { error } = await context.supabase.from("time_entries").insert({
                  cleaner_id: task.cleaner_id,
                  property_id: task.property_id,
                  source: "whatsapp",
                });
                if (error) throw error;
              }
              await context.supabase.from("cleaning_tasks").update({ status: "in_progress" }).eq("id", task.id);
              applied = true;
            } else {
              const { data: openShift } = await context.supabase
                .from("time_entries")
                .select("id, break_minutes, break_started_at")
                .eq("cleaner_id", task.cleaner_id)
                .is("clock_out_at", null)
                .maybeSingle();
              if (openShift) {
                const now = new Date();
                let breakAdd = 0;
                if (openShift.break_started_at) {
                  breakAdd = Math.max(0, Math.round((now.getTime() - new Date(openShift.break_started_at).getTime()) / 60000));
                }
                await context.supabase
                  .from("time_entries")
                  .update({
                    clock_out_at: now.toISOString(),
                    break_started_at: null,
                    break_minutes: (openShift.break_minutes ?? 0) + breakAdd,
                    status: "completed",
                  })
                  .eq("id", openShift.id);
              }
              await context.supabase.from("cleaning_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
              applied = true;
            }
          } catch (e: any) {
            applyError = e.message;
          }
        }
      }
    }

    await context.supabase.from("dispatch_replies").insert({
      cleaner_id: data.cleanerId,
      raw_text: data.text,
      parsed_action: parsed,
      task_id: taskId,
      applied,
      applied_error: applyError,
      received_via: "simulation",
    });

    return { parsed, taskId, applied, error: applyError };
  });

export const saveDispatchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { morningTime?: string; timezone?: string; enabled?: boolean; template?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const rows: { key: string; value: any }[] = [];
    if (data.morningTime !== undefined) rows.push({ key: "dispatch.morning_time", value: data.morningTime });
    if (data.timezone !== undefined) rows.push({ key: "dispatch.timezone", value: data.timezone });
    if (data.enabled !== undefined) rows.push({ key: "dispatch.enabled", value: data.enabled });
    if (data.template !== undefined) rows.push({ key: "dispatch.message_template", value: data.template });
    for (const r of rows) {
      const { error } = await context.supabase
        .from("app_settings")
        .upsert({ key: r.key, value: r.value, updated_by: context.userId, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    return { ok: true };
  });
