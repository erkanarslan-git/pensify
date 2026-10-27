import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Department workers the signed-in chief may reset a password for (power granted per chief). */
export const listResettableMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: depts, error } = await (context.supabase as any).rpc("my_todo_departments");
    if (error) throw new Error("unavailable");
    const ids = [...new Set(((depts ?? []) as { is_lead: boolean; members: string[] | null }[])
      .filter((d) => d.is_lead).flatMap((d) => d.members ?? []))].filter((id) => id !== context.userId);
    const allowed: string[] = [];
    for (const id of ids) {
      const { data } = await (context.supabase as any).rpc("can_reset_member_password", { _target: id });
      if (data === true) allowed.push(id);
    }
    if (!allowed.length) return [];
    const { data: names } = await context.supabase.from("profiles").select("id,full_name").in("id", allowed);
    return (names ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "—" }));
  });

export const leadResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Authority is decided by the database as the caller, before any privileged call.
    const { data: ok, error } = await (context.supabase as any).rpc("can_reset_member_password", { _target: data.userId });
    if (error || ok !== true) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (e) throw new Error("reset_failed");
    return { ok: true };
  });
