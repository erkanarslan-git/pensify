import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const loadTodoOptions = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { resolveActiveOrg } = await import("./org-auth.server"); const { orgId } = await resolveActiveOrg(context.supabase);
  const { data: members, error } = await context.supabase.from("organization_members").select("user_id").eq("organization_id", orgId).eq("active", true);
  if (error) throw new Error("todo_options_unavailable");
  if (!members) throw new Error("todo_options_unavailable");
  // Names come from a scoped database function, so this works without the server admin key (e.g. on external hosting).
  const { data: names, error: namesError } = await (context.supabase as any).rpc("todo_member_names");
  if (namesError) throw new Error("todo_options_unavailable");
  const { data: properties, error: propertyError } = await context.supabase.from("properties").select("id,name").eq("organization_id", orgId).order("name");
  if (propertyError) throw new Error("todo_options_unavailable");
  const { data: depts } = await (context.supabase as any).rpc("my_todo_departments");
  const { data: office } = await (context.supabase as any).rpc("has_organization_role", { _org: orgId, _roles: ["owner", "admin", "operations_manager", "property_manager", "reception"] });
  return { departments: ((depts ?? []) as { department: string; is_lead: boolean; members: string[] | null }[]).map((d) => ({ department: d.department, isLead: d.is_lead, members: d.members ?? [] })), office: office === true, users: ((names ?? []) as { id: string; full_name: string | null }[]).map((p) => ({ id: p.id, name: p.full_name ?? "—" })), properties: properties ?? [], userId: context.userId };
});