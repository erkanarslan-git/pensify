import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isOwner } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "owner",
  });
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isOwner && !isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
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

    if (data.entity) {
      query = query.eq("entity", data.entity);
    }
    if (data.action) {
      query = query.eq("action", data.action);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Response(error.message, { status: 500 });

    return { rows: rows ?? [], count: count ?? 0 };
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
