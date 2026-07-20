import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ROLES = ["owner", "admin", "manager", "reception", "cleaner"] as const;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isOwner }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" }),
  ]);
  if (!isAdmin && !isOwner) throw new Error("Forbidden");
}

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; full_name?: string; role?: string }) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      full_name: z.string().optional(),
      role: z.enum(ROLES).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name ?? data.email.split("@")[0] },
    });
    if (error) throw new Error(error.message);
    const uid = created.user?.id;
    if (!uid) throw new Error("User creation failed");
    if (data.role) {
      await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role }).select();
    }
    return { id: uid };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Du kannst dich nicht selbst löschen.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Prevent deleting the last owner
    const { data: owners } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "owner");
    const isOwner = (owners ?? []).some((r: any) => r.user_id === data.userId);
    if (isOwner && (owners ?? []).length <= 1) throw new Error("Letzten Inhaber kann man nicht löschen.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; banned: boolean }) =>
    z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Du kannst dich nicht selbst sperren.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.banned) {
      const { data: owners } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "owner");
      const isOwner = (owners ?? []).some((r: any) => r.user_id === data.userId);
      if (isOwner && (owners ?? []).length <= 1) throw new Error("Letzten Inhaber kann man nicht sperren.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.banned ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
