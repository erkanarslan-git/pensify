import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole, ADMIN_ROLES, MANAGER_ROLES } from "@/lib/org-auth.server";

async function requireAdmin(context: { supabase: any; userId: string }) {
  try { return await requireOrgRole(context.supabase, ADMIN_ROLES); }
  catch { throw new Response("Forbidden", { status: 403 }); }
}

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
        entity: z.string().optional(),
        action: z.enum(["INSERT", "UPDATE", "DELETE", ""]).optional().default(""),
        email: z.string().optional(),
        entityId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    let query = context.supabase
      .from("audit_logs")
      .select("id, actor_id, actor_email, entity, entity_id, action, diff, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.entity) query = query.eq("entity", data.entity);
    if (data.action) query = query.eq("action", data.action);
    if (data.email) query = query.ilike("actor_email", `%${data.email}%`);
    if (data.entityId) query = query.ilike("entity_id", `%${data.entityId}%`);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);

    const { data: rows, error, count } = await query;
    if (error) throw new Response(error.message, { status: 500 });

    return { rows: rows ?? [], count: count ?? 0 };
  });

export const getAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: row, error } = await context.supabase
      .from("audit_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Response(error.message, { status: 500 });
    return row;
  });

export const getRecordHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ entity: z.string(), entityId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("audit_logs")
      .select("id, actor_email, action, diff, created_at")
      .eq("entity", data.entity)
      .eq("entity_id", data.entityId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });

export const listAuditEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("entity")
      .order("entity");
    if (error) throw new Response(error.message, { status: 500 });
    const entities = Array.from(new Set((data ?? []).map((r: { entity: string }) => r.entity)));
    return entities;
  });
