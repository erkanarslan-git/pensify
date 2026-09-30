import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgRole, ADMIN_ROLES } from "@/lib/org-auth.server";
import { z } from "zod";

const ROLES = ["owner", "admin", "manager", "reception", "cleaner"] as const;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  try { return await requireOrgRole(ctx.supabase, ADMIN_ROLES); }
  catch { throw new Error("Forbidden"); }
}

// Target user must belong to (or have requested access to) the caller's organization.
async function assertTargetInOrg(admin: any, orgId: string, userId: string) {
  const [{ data: m }, { data: r }] = await Promise.all([
    admin.from("organization_members").select("id").eq("organization_id", orgId).eq("user_id", userId).maybeSingle(),
    admin.from("access_requests").select("id").eq("organization_id", orgId).eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  if (!m && !r) throw new Error("Forbidden");
}

async function orgOwners(admin: any, orgId: string): Promise<string[]> {
  const { data } = await admin.from("organization_members").select("user_id").eq("organization_id", orgId).eq("role", "owner").eq("active", true);
  return (data ?? []).map((r: any) => r.user_id);
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
    const { orgId } = await assertAdmin(context);
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
      const orgRole = data.role === "manager" ? "operations_manager" : data.role;
      if (orgRole === "owner") throw new Error("Inhaber kann nur über die Rollenverwaltung vergeben werden.");
      await supabaseAdmin.from("organization_members").insert({ organization_id: orgId, user_id: uid, role: orgRole as any });
    }
    return { id: uid };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { orgId } = await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Du kannst dich nicht selbst löschen.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Prevent deleting the last owner
    await assertTargetInOrg(supabaseAdmin, orgId, data.userId);
    const owners = await orgOwners(supabaseAdmin, orgId);
    const isOwner = owners.includes(data.userId);
    if (isOwner && owners.length <= 1) throw new Error("Letzten Inhaber kann man nicht löschen.");
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
    const { orgId } = await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Du kannst dich nicht selbst sperren.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetInOrg(supabaseAdmin, orgId, data.userId);
    if (data.banned) {
      const owners = await orgOwners(supabaseAdmin, orgId);
      const isOwner = owners.includes(data.userId);
      if (isOwner && owners.length <= 1) throw new Error("Letzten Inhaber kann man nicht sperren.");
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
    const { orgId } = await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTargetInOrg(supabaseAdmin, orgId, data.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
