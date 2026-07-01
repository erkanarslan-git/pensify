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
    .select("id, room_id, property_id, status, due_at, rooms:room_id (number), properties:property_id (name)")
    .eq("cleaner_id", cleanerId)
    .in("status", ["pending", "accepted", "in_progress"])
    .gte("due_at", dayStart)
    .lte("due_at", dayEnd)
    .order("due_at", { ascending: true });

  if (!tasks || tasks.length === 0) return { cleanerId, skipped: true, reason: "no_tasks" };

  const { data: tokenRows } = await supabase.rpc("admin_list_property_qr_tokens");
  const tokenMap = new Map<string, string | null>(
    ((tokenRows ?? []) as Array<{ id: string; qr_token: string | null }>).map((r) => [r.id, r.qr_token]),
  );
  const items = tasks.map((t: any) => ({
    propertyName: t.properties?.name ?? "—",
    roomNumber: t.rooms?.number ?? "—",
    link: t.property_id && tokenMap.get(t.property_id)
      ? `${PUBLIC_BASE}/clock/${tokenMap.get(t.property_id)}`
      : `${PUBLIC_BASE}/me`,
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

// ---------- Action engine (shared by text-parse + structured buttons) ----------

type ActionKind = "accept" | "start" | "complete" | "problem";

async function applyAction(
  supabase: any,
  taskId: string,
  action: ActionKind,
): Promise<{ applied: boolean; error?: string; roomStatus?: string; taskStatus?: string }> {
  const { data: task, error: te } = await supabase
    .from("cleaning_tasks")
    .select("id, room_id, property_id, cleaner_id, status")
    .eq("id", taskId)
    .maybeSingle();
  if (te) return { applied: false, error: te.message };
  if (!task) return { applied: false, error: "task_not_found" };
  if (!task.cleaner_id) return { applied: false, error: "no_cleaner_assigned" };
  const cleanerId: string = task.cleaner_id;
  const roomId: string | null = task.room_id;

  try {
    if (action === "accept") {
      await supabase.from("cleaning_tasks").update({ status: "accepted" }).eq("id", task.id);
      return { applied: true, taskStatus: "accepted" };
    }

    if (action === "start") {
      // ensure an open time_entry exists at this property
      const { data: openShift } = await supabase
        .from("time_entries")
        .select("id")
        .eq("cleaner_id", cleanerId)
        .is("clock_out_at", null)
        .maybeSingle();
      if (!openShift) {
        const { error } = await supabase.from("time_entries").insert({
          cleaner_id: cleanerId,
          property_id: task.property_id,
          source: "whatsapp",
        });
        if (error) throw error;
      }
      await supabase.from("cleaning_tasks").update({ status: "in_progress" }).eq("id", task.id);
      if (roomId) await supabase.from("rooms").update({ status: "cleaning_in_progress" }).eq("id", roomId);
      return { applied: true, taskStatus: "in_progress", roomStatus: "cleaning_in_progress" };
    }

    if (action === "complete") {
      // close any open shift
      const { data: openShift } = await supabase
        .from("time_entries")
        .select("id, break_minutes, break_started_at")
        .eq("cleaner_id", cleanerId)
        .is("clock_out_at", null)
        .maybeSingle();
      if (openShift) {
        const now = new Date();
        let breakAdd = 0;
        if (openShift.break_started_at) {
          breakAdd = Math.max(0, Math.round((now.getTime() - new Date(openShift.break_started_at).getTime()) / 60000));
        }
        await supabase
          .from("time_entries")
          .update({
            clock_out_at: now.toISOString(),
            break_started_at: null,
            break_minutes: (openShift.break_minutes ?? 0) + breakAdd,
            status: "completed",
          })
          .eq("id", openShift.id);
      }
      await supabase
        .from("cleaning_tasks")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", task.id);
      if (roomId) await supabase.from("rooms").update({ status: "cleaned" }).eq("id", roomId);
      return { applied: true, taskStatus: "completed", roomStatus: "cleaned" };
    }

    if (action === "problem") {
      await supabase.from("cleaning_tasks").update({ status: "problem" }).eq("id", task.id);
      if (roomId) await supabase.from("rooms").update({ status: "maintenance" }).eq("id", roomId);
      return { applied: true, taskStatus: "problem", roomStatus: "maintenance" };
    }

    return { applied: false, error: "unknown_action" };
  } catch (e: any) {
    return { applied: false, error: e.message };
  }
}

async function resolveTaskFromText(
  supabase: any,
  cleanerId: string,
  scheduledFor: string,
  text: string,
): Promise<{ action: ActionKind | null; taskId: string | null; parsedLabel: string }> {
  // Patterns: "1 N"=start, "2 N"=complete, "3 N"=accept, "4 N"=problem
  const m = text.trim().match(/^([1-4])\s+(\d+)/);
  if (!m) return { action: null, taskId: null, parsedLabel: "unknown" };
  const map: Record<string, ActionKind> = { "1": "start", "2": "complete", "3": "accept", "4": "problem" };
  const action = map[m[1]];
  const idx = parseInt(m[2], 10) - 1;
  const { data: msg } = await supabase
    .from("dispatch_messages")
    .select("task_ids")
    .eq("cleaner_id", cleanerId)
    .eq("scheduled_for", scheduledFor)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const taskId = msg?.task_ids?.[idx] ?? null;
  return { action, taskId, parsedLabel: action };
}

export const simulateReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cleanerId: string; text?: string; action?: ActionKind; taskId?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const settings = await loadSettings(context.supabase);
    const tz = (settings["dispatch.timezone"] as string) || "Europe/Istanbul";
    const scheduledFor = todayISO(tz);

    let action: ActionKind | null = data.action ?? null;
    let taskId: string | null = data.taskId ?? null;
    let parsed = action ?? "unknown";

    if (!action && data.text) {
      const resolved = await resolveTaskFromText(context.supabase, data.cleanerId, scheduledFor, data.text);
      action = resolved.action;
      taskId = resolved.taskId;
      parsed = resolved.parsedLabel as any;
    }

    let result: { applied: boolean; error?: string; roomStatus?: string; taskStatus?: string } = { applied: false };
    if (action && taskId) {
      result = await applyAction(context.supabase, taskId, action);
    }

    await context.supabase.from("dispatch_replies").insert({
      cleaner_id: data.cleanerId,
      raw_text: data.text ?? `[button:${action ?? "unknown"}]`,
      parsed_action: parsed,
      task_id: taskId,
      applied: result.applied,
      applied_error: result.error ?? null,
      received_via: "simulation",
    });

    return { parsed, taskId, applied: result.applied, error: result.error, taskStatus: result.taskStatus, roomStatus: result.roomStatus };
  });

// ---------- Demo scenario: drives a cleaner's tasks through the full lifecycle ----------

export const runDemoScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cleanerId?: string; reset?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const settings = await loadSettings(context.supabase);
    const tz = (settings["dispatch.timezone"] as string) || "Europe/Istanbul";
    const scheduledFor = todayISO(tz);
    const dayStart = `${scheduledFor}T00:00:00Z`;
    const dayEnd = `${scheduledFor}T23:59:59Z`;

    // Pick the cleaner: argument or first active cleaner with tasks today
    let cleanerId = data.cleanerId ?? null;
    if (!cleanerId) {
      const { data: rows } = await context.supabase
        .from("cleaning_tasks")
        .select("cleaner_id")
        .gte("due_at", dayStart)
        .lte("due_at", dayEnd)
        .not("cleaner_id", "is", null)
        .limit(1);
      cleanerId = rows?.[0]?.cleaner_id ?? null;
    }
    if (!cleanerId) return { ok: false, error: "no_tasks_today" };

    const { data: tasks } = await context.supabase
      .from("cleaning_tasks")
      .select("id, room_id, status, rooms:room_id (number)")
      .eq("cleaner_id", cleanerId)
      .gte("due_at", dayStart)
      .lte("due_at", dayEnd)
      .order("due_at", { ascending: true });
    if (!tasks || tasks.length === 0) return { ok: false, error: "no_tasks_for_cleaner" };

    // Optional: reset to a known starting point
    if (data.reset) {
      for (const t of tasks) {
        await context.supabase.from("cleaning_tasks").update({ status: "pending", completed_at: null }).eq("id", t.id);
        if (t.room_id) await context.supabase.from("rooms").update({ status: "cleaning_required" }).eq("id", t.room_id);
      }
      // close any open shift to start clean
      await context.supabase
        .from("time_entries")
        .update({ clock_out_at: new Date().toISOString(), status: "auto_closed", notes: "demo reset" })
        .eq("cleaner_id", cleanerId)
        .is("clock_out_at", null);
    }

    const steps: Array<{ step: string; taskId: string; room: any; result: any }> = [];
    const t1 = tasks[0];
    const t2 = tasks[1] ?? null;

    // Task 1: happy path  Accept -> Start -> Complete
    for (const action of ["accept", "start", "complete"] as ActionKind[]) {
      const r = await applyAction(context.supabase, t1.id, action);
      steps.push({ step: `task1.${action}`, taskId: t1.id, room: t1.rooms, result: r });
      if (!r.applied) break;
    }

    // Task 2 (if exists): Accept -> Start -> Report Problem
    if (t2) {
      for (const action of ["accept", "start", "problem"] as ActionKind[]) {
        const r = await applyAction(context.supabase, t2.id, action);
        steps.push({ step: `task2.${action}`, taskId: t2.id, room: t2.rooms, result: r });
        if (!r.applied) break;
      }
    }

    // Log the run
    await context.supabase.from("dispatch_replies").insert({
      cleaner_id: cleanerId,
      raw_text: `[demo-scenario steps=${steps.length}]`,
      parsed_action: "demo",
      task_id: null,
      applied: steps.every((s) => s.result.applied),
      received_via: "simulation",
    });

    return { ok: true, cleanerId, scheduledFor, steps };
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
