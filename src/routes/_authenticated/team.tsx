import { Fragment as FragmentRow } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Shield, Plus, X, CheckCircle2, XCircle, Inbox, UserPlus, Trash2, Lock, Unlock, KeyRound } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ALL_ROLES, ROLE_LABEL, PERMISSIONS, type AppRole } from "@/lib/permissions";
import { adminCreateUser, adminDeleteUser, adminSetUserBanned, adminResetUserPassword } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Pensify" }] }),
  component: TeamPage,
});

const ROLE_TONE: Record<AppRole, "success" | "warning" | "muted" | "destructive" | "info"> = {
  owner: "destructive", admin: "warning", manager: "success", reception: "info", cleaner: "muted",
};

function TeamPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState<{ userId: string; role: AppRole } | null>(null);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return data ?? [];
    },
  });

  const requests = useQuery({
    queryKey: ["access-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("access_requests")
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rolePermsQ = useQuery({
    queryKey: ["role-perms"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("role_permissions").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const userPermsQ = useQuery({
    queryKey: ["user-perms"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("user_permissions").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_set_role", { _user_id: userId, _role: role });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setAdding(null); toast.success("Rolle vergeben"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_remove_role", { _user_id: userId, _role: role });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Rolle entfernt"); },
    onError: (e: any) => toast.error(e.message),
  });

  const setRolePerm = useMutation({
    mutationFn: async ({ role, permission, allowed }: { role: AppRole; permission: string; allowed: boolean }) => {
      const { error } = await (supabase as any).from("role_permissions").upsert({ role, permission, allowed, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-perms"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const resolveRequest = useMutation({
    mutationFn: async ({ id, role, approve }: { id: string; role: AppRole; approve: boolean }) => {
      const { error } = await supabase.rpc("admin_resolve_access_request" as any, { _request_id: id, _grant_role: role, _approve: approve });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["access-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Erledigt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Effective role-permission lookup: override → default
  const rolePerm = (role: AppRole, key: string): boolean => {
    const o = rolePermsQ.data?.find((r: any) => r.role === role && r.permission === key);
    if (o) return o.allowed;
    return PERMISSIONS.find((p) => p.key === key)?.defaultRoles.includes(role) ?? false;
  };

  const pendingRequests = (requests.data ?? []).filter((r: any) => r.status === "pending");
  const groups = Array.from(new Set(PERMISSIONS.map((p) => p.group)));

  return (
    <AppShell title="Team & Rollen" subtitle="Zugriffsanfragen, Rollen und Berechtigungen verwalten">
      {/* Access requests */}
      {pendingRequests.length > 0 && (
        <Section title={`Offene Zugriffsanfragen (${pendingRequests.length})`}>
          <div className="space-y-2">
            {pendingRequests.map((r: any) => {
              const user = (users.data ?? []).find((u: any) => u.user_id === r.user_id);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <Inbox className="w-4 h-4 text-warning" />
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm font-medium">{user?.full_name || "—"} <span className="text-muted-foreground font-normal">· {user?.email}</span></div>
                    <div className="text-xs text-muted-foreground">Wunschrolle: {ROLE_LABEL[(r.requested_role ?? "manager") as AppRole]} · {new Date(r.created_at).toLocaleString("de-DE")}</div>
                    {r.message && <div className="text-xs mt-1 italic">"{r.message}"</div>}
                  </div>
                  <Select defaultValue={r.requested_role ?? "manager"} onValueChange={(v) => (r._role = v)}>
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.filter((x) => x !== "owner").map((x) => <SelectItem key={x} value={x}>{ROLE_LABEL[x]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => resolveRequest.mutate({ id: r.id, role: (r._role ?? r.requested_role ?? "manager") as AppRole, approve: true })}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Freigeben
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resolveRequest.mutate({ id: r.id, role: "manager", approve: false })}>
                    <XCircle className="w-4 h-4 mr-1" /> Ablehnen
                  </Button>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Benutzer</th>
              <th className="text-left p-3">E-Mail</th>
              <th className="text-left p-3">Rollen</th>
              <th className="text-right p-3 w-64">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u: any) => {
              const missing = ALL_ROLES.filter((r) => !u.roles.includes(r));
              return (
                <tr key={u.user_id} className="border-t border-border">
                  <td className="p-3 font-medium">{u.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">Keine Rolle</span>}
                      {(u.roles as AppRole[]).map((r) => (
                        <span key={r} className="inline-flex items-center gap-1">
                          <Badge tone={ROLE_TONE[r]}>
                            <Shield className="w-3 h-3 mr-1 inline" />
                            {ROLE_LABEL[r]}
                          </Badge>
                          <button className="text-muted-foreground hover:text-destructive" onClick={() => removeRole.mutate({ userId: u.user_id, role: r })} title="Rolle entfernen">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <UserPermsDialog userId={u.user_id} userName={u.full_name || u.email} roles={u.roles} userPerms={userPermsQ.data ?? []} rolePerm={rolePerm} onChange={() => qc.invalidateQueries({ queryKey: ["user-perms"] })} />
                      {missing.length > 0 && (
                        adding?.userId === u.user_id ? (
                          <div className="flex gap-1 justify-end">
                            <Select value={adding!.role} onValueChange={(v) => setAdding({ userId: adding!.userId, role: v as AppRole })}>
                              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {missing.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button size="sm" onClick={() => adding && addRole.mutate(adding)}>OK</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setAdding({ userId: u.user_id, role: missing[0] })}>
                            <Plus className="w-3 h-3 mr-1" /> Rolle
                          </Button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Role permissions matrix — editable */}
      <div className="mt-6 rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Berechtigungen pro Rolle</div>
            <div className="text-xs text-muted-foreground">Klicke auf eine Zelle, um die Berechtigung umzuschalten.</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Berechtigung</th>
                {ALL_ROLES.map((r) => <th key={r} className="p-3 text-center">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <FragmentRow key={`g-${g}`}>
                  <tr className="bg-muted/20">
                    <td colSpan={ALL_ROLES.length + 1} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase">{g}</td>
                  </tr>
                  {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                    <tr key={p.key} className="border-t border-border">
                      <td className="p-3">{p.label}</td>
                      {ALL_ROLES.map((r) => {
                        const on = rolePerm(r, p.key);
                        const isOwner = r === "owner";
                        return (
                          <td key={r} className="p-2 text-center">
                            <button
                              disabled={isOwner}
                              onClick={() => setRolePerm.mutate({ role: r, permission: p.key, allowed: !on })}
                              className={`w-7 h-7 rounded-md border transition-colors ${on ? "bg-success/15 border-success/40 text-success" : "bg-muted/40 border-border text-muted-foreground/50"} ${isOwner ? "opacity-60 cursor-not-allowed" : "hover:opacity-80"}`}
                              title={isOwner ? "Inhaber hat immer alle Rechte" : on ? "Erlaubt" : "Verweigert"}
                            >
                              {on ? "✓" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </FragmentRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function UserPermsDialog({ userId, userName, roles, userPerms, rolePerm, onChange }: {
  userId: string; userName: string; roles: AppRole[]; userPerms: any[];
  rolePerm: (role: AppRole, key: string) => boolean;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Resolve effective from any of the user's roles (OR)
  const effective = (key: string): boolean => roles.some((r) => rolePerm(r, key));
  const override = (key: string): boolean | null => {
    const o = userPerms.find((u: any) => u.user_id === userId && u.permission === key);
    return o ? o.allowed : null;
  };

  async function set(permission: string, allowed: boolean | null) {
    if (allowed === null) {
      await (supabase as any).from("user_permissions").delete().eq("user_id", userId).eq("permission", permission);
    } else {
      await (supabase as any).from("user_permissions").upsert({ user_id: userId, permission, allowed, updated_at: new Date().toISOString() });
    }
    onChange();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">Rechte</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Individuelle Berechtigungen — {userName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-1">
          {PERMISSIONS.map((p) => {
            const ov = override(p.key);
            const eff = ov ?? effective(p.key);
            return (
              <div key={p.key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border">
                <div className="min-w-0">
                  <div className="text-sm">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.group} · Standard aus Rolle: {effective(p.key) ? "Erlaubt" : "Verweigert"}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => set(p.key, true)} className={`px-2 py-1 rounded text-xs border ${ov === true ? "bg-success/15 border-success/40 text-success" : "border-border"}`}>Erlauben</button>
                  <button onClick={() => set(p.key, false)} className={`px-2 py-1 rounded text-xs border ${ov === false ? "bg-destructive/15 border-destructive/40 text-destructive" : "border-border"}`}>Verweigern</button>
                  <button onClick={() => set(p.key, null)} className={`px-2 py-1 rounded text-xs border ${ov === null ? "bg-muted" : "border-border"}`}>Standard</button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
