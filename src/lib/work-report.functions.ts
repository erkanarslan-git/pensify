import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole } from "@/lib/org-auth.server";
import { businessDate, businessDayBounds } from "@/lib/business-time";
import type { WorkItem } from "@/lib/work-report";

const LIMIT = 5000;
const Input = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  propertyId: z.string().uuid().optional(),
});

/** Owner-only operations report. Organization is resolved server-side; every query is org-scoped. */
export const getWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let orgId: string;
    try { orgId = (await requireOrgRole(sb, ["owner"])).orgId; } catch { throw new Error("Forbidden"); }
    if (data.from > data.to) throw new Error("invalid_range");
    if ((Date.parse(data.to) - Date.parse(data.from)) / 86400000 > 92) throw new Error("range_too_long");
    const start = businessDayBounds(data.from).start;
    const end = businessDayBounds(data.to).end;
    const today = businessDate();
    const prop = (q: any) => (data.propertyId ? q.eq("property_id", data.propertyId) : q);

    const [props, resNew, resCanc, cleanDone, cleanOpen, issDone, issOpen, todoDone, todoOpen] = await Promise.all([
      sb.from("properties").select("id,name").eq("organization_id", orgId).order("name"),
      prop(sb.from("reservations").select("id,guest_name,status,channel,created_at,created_by,property_id,notes,rooms:room_id(number)")
        .eq("organization_id", orgId).is("deleted_at", null).gte("created_at", start).lt("created_at", end)).limit(LIMIT),
      prop(sb.from("reservations").select("id,guest_name,status,channel,updated_at,created_by,property_id,notes,rooms:room_id(number)")
        .eq("organization_id", orgId).is("deleted_at", null).eq("status", "cancelled").gte("updated_at", start).lt("updated_at", end)).limit(LIMIT),
      prop(sb.from("cleaning_tasks").select("id,status,completed_at,due_at,notes,property_id,photos_count,rooms:room_id(number),cleaners:cleaner_id(id,full_name)")
        .eq("organization_id", orgId).eq("status", "completed").gte("completed_at", start).lt("completed_at", end)).limit(LIMIT),
      prop(sb.from("cleaning_tasks").select("id,status,completed_at,due_at,notes,property_id,photos_count,rooms:room_id(number),cleaners:cleaner_id(id,full_name)")
        .eq("organization_id", orgId).in("status", ["pending", "accepted", "in_progress", "problem"]).lt("due_at", end)).limit(LIMIT),
      prop(sb.from("room_issues").select("id,category,description,status,resolved_at,resolved_by,reported_by,resolution_note,property_id,rooms:room_id(number)")
        .eq("organization_id", orgId).eq("status", "resolved").gte("resolved_at", start).lt("resolved_at", end)).limit(LIMIT),
      prop(sb.from("room_issues").select("id,category,description,status,created_at,reported_by,property_id,rooms:room_id(number)")
        .eq("organization_id", orgId).neq("status", "resolved")).limit(LIMIT),
      data.propertyId ? Promise.resolve({ data: [] }) : sb.from("todos").select("id,title,notes,priority,due_date,done_at,done_by,created_by")
        .eq("organization_id", orgId).eq("done", true).gte("done_at", start).lt("done_at", end).limit(LIMIT),
      data.propertyId ? Promise.resolve({ data: [] }) : sb.from("todos").select("id,title,notes,priority,due_date,created_at,created_by")
        .eq("organization_id", orgId).eq("done", false).limit(LIMIT),
    ]);
    for (const r of [props, resNew, resCanc, cleanDone, cleanOpen, issDone, issOpen, todoDone, todoOpen]) if (r.error) throw new Error(r.error.message);

    const propName = new Map<string, string>((props.data ?? []).map((p: any) => [p.id, p.name]));
    const userIds = new Set<string>();
    for (const r of [...resNew.data, ...resCanc.data]) r.created_by && userIds.add(r.created_by);
    for (const r of [...issDone.data, ...issOpen.data]) { r.resolved_by && userIds.add(r.resolved_by); r.reported_by && userIds.add(r.reported_by); }
    for (const r of [...todoDone.data, ...todoOpen.data]) { r.done_by && userIds.add(r.done_by); r.created_by && userIds.add(r.created_by); }
    const names = new Map<string, string>();
    if (userIds.size) {
      const ids = [...userIds];
      const [{ data: pr }, { data: cl }] = await Promise.all([
        sb.from("profiles").select("id,full_name").in("id", ids),
        sb.from("cleaners").select("user_id,full_name").eq("organization_id", orgId).in("user_id", ids),
      ]);
      for (const c of cl ?? []) c.full_name && names.set(c.user_id, c.full_name);
      for (const p of pr ?? []) p.full_name && names.set(p.id, p.full_name);
    }
    const nm = (id: string | null) => (id ? names.get(id) ?? null : null);
    const day = (iso: string | null) => (iso ? businessDate(new Date(iso)) : null);
    const base = (p: string | null) => ({ propertyId: p, propertyName: p ? propName.get(p) ?? null : null });

    const items: WorkItem[] = [];
    for (const r of resNew.data) items.push({ id: r.id, topic: "res_new", kind: "reservation", at: r.created_at, day: day(r.created_at), ...base(r.property_id), room: r.rooms?.number ?? null, staffId: r.created_by, staff: nm(r.created_by), status: r.status, source: r.channel, title: r.guest_name, note: r.notes });
    for (const r of resCanc.data) items.push({ id: r.id, topic: "res_cancelled", kind: "reservation", at: r.updated_at, day: day(r.updated_at), ...base(r.property_id), room: r.rooms?.number ?? null, staffId: r.created_by, staff: nm(r.created_by), status: r.status, source: r.channel, title: r.guest_name, note: r.notes });
    for (const r of cleanDone.data) items.push({ id: r.id, topic: "clean_done", kind: "cleaning", at: r.completed_at, day: day(r.completed_at), ...base(r.property_id), room: r.rooms?.number ?? null, staffId: r.cleaners?.id ?? null, staff: r.cleaners?.full_name ?? null, status: r.status, source: "app", title: r.rooms?.number ?? "", note: r.notes });
    for (const r of cleanOpen.data) items.push({ id: r.id, topic: r.status === "problem" ? "clean_review" : "clean_open", kind: "cleaning", at: r.due_at, day: null, ...base(r.property_id), room: r.rooms?.number ?? null, staffId: r.cleaners?.id ?? null, staff: r.cleaners?.full_name ?? null, status: r.status, source: "app", title: r.rooms?.number ?? "", note: r.notes });
    for (const r of issDone.data) items.push({ id: r.id, topic: "issue_done", kind: "issue", at: r.resolved_at, day: day(r.resolved_at), ...base(r.property_id), room: r.rooms?.number ?? null, staffId: r.resolved_by, staff: nm(r.resolved_by), status: r.status, source: r.category, title: r.description, note: r.resolution_note });
    for (const r of issOpen.data) items.push({ id: r.id, topic: "issue_open", kind: "issue", at: r.created_at, day: null, ...base(r.property_id), room: r.rooms?.number ?? null, staffId: r.reported_by, staff: nm(r.reported_by), status: r.status, source: r.category, title: r.description, note: null });
    for (const r of todoDone.data) items.push({ id: r.id, topic: "todo_done", kind: "todo", at: r.done_at, day: day(r.done_at), propertyId: null, propertyName: null, room: null, staffId: r.done_by, staff: nm(r.done_by), status: "done", source: r.priority, title: r.title, note: r.notes });
    for (const r of todoOpen.data) items.push({ id: r.id, topic: r.due_date && r.due_date < today ? "todo_overdue" : "todo_open", kind: "todo", at: r.due_date ?? r.created_at, day: null, propertyId: null, propertyName: null, room: null, staffId: r.created_by, staff: nm(r.created_by), status: "open", source: r.priority, title: r.title, note: r.notes });

    return { items, properties: (props.data ?? []) as { id: string; name: string }[], truncated: [resNew, cleanDone, cleanOpen].some((r: any) => (r.data?.length ?? 0) >= LIMIT) };
  });
