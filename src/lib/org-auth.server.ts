// Organization-scoped authorization helpers (server only).
// Authorization always comes from organization_members.role in ONE resolved organization.
// Legacy global user_roles must never be used here.

export type OrgRole = "owner" | "admin" | "operations_manager" | "property_manager" | "reception" | "cleaner";

export class OrgAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Resolve the caller's single active organization. Fails closed when ambiguous or missing. */
export async function resolveActiveOrg(supabase: any): Promise<{ orgId: string; role: OrgRole }> {
  const { data: orgId, error } = await supabase.rpc("active_organization_id");
  if (error || !orgId) throw new OrgAuthError(403, "organization_required");
  const { data: role } = await supabase.rpc("my_org_role", { _org: orgId });
  if (!role) throw new OrgAuthError(403, "not_a_member");
  return { orgId: orgId as string, role: role as OrgRole };
}

export async function requireOrgRole(supabase: any, roles: OrgRole[]) {
  const ctx = await resolveActiveOrg(supabase);
  if (!roles.includes(ctx.role)) throw new OrgAuthError(403, "Forbidden");
  return ctx;
}

export async function requireOrgPermission(supabase: any, permission: string) {
  const ctx = await resolveActiveOrg(supabase);
  const { data } = await supabase.rpc("has_organization_permission", { _org: ctx.orgId, _permission: permission });
  if (data !== true) throw new OrgAuthError(403, "Forbidden");
  return ctx;
}

export const ADMIN_ROLES: OrgRole[] = ["owner", "admin"];
export const MANAGER_ROLES: OrgRole[] = ["owner", "admin", "operations_manager"];
