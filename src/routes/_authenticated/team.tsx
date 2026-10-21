import { Fragment as FragmentRow } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Shield, Plus, X, CheckCircle2, XCircle, Inbox, UserPlus, Trash2, Lock, Unlock, KeyRound, Users, UserX, Search, Building2, ChevronRight, Mail, Clock, History, AlertTriangle } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePermissions } from "@/hooks/use-permissions";
import { EmployeeAttendance } from "@/components/employee-attendance";
import { useTranslation } from "react-i18next";
import { deletionNameMatches } from "@/lib/team-safety";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Pensify" }, { name: "description", content: "Team, Rollen und Anwesenheit verwalten." }, { property: "og:title", content: "Team — Pensify" }, { property: "og:description", content: "Team, Rollen und Anwesenheit verwalten." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TeamPage,
});

const ROLE_TONE: Record<AppRole, "success" | "warning" | "muted" | "destructive" | "info"> = {
  owner: "destructive", admin: "warning", manager: "success", reception: "info", cleaner: "muted",
};

function TeamPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { userId: currentUserId, isOwner: iAmOwner } = usePermissions();
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [adding, setAdding] = useState<{ userId: string; role: AppRole } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const createFn = useServerFn(adminCreateUser);
  const deleteFn = useServerFn(adminDeleteUser);
  const banFn = useServerFn(adminSetUserBanned);
  const resetPwFn = useServerFn(adminResetUserPassword);

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["cleaners"] }); qc.invalidateQueries({ queryKey: ["my-permissions"] }); setAdding(null); toast.success("Rolle vergeben"); },
    onError: (e: any) => toast.error(e.message),
  });

  const setRolePerm = useMutation({
    mutationFn: async ({ role, permission, allowed }: { role: AppRole; permission: string; allowed: boolean }) => {
      const { data: orgId } = await supabase.rpc("active_organization_id");
      if (!orgId) throw new Error("Keine eindeutige Organisation");
      const { error } = await (supabase as any).from("role_permissions").upsert({ organization_id: orgId, role, permission, allowed, updated_at: new Date().toISOString() }, { onConflict: "organization_id,role,permission" });
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

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => { await deleteFn({ data: { userId } }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Benutzer gelöscht"); },
    onError: (e: any) => toast.error(e.message),
  });
  const banUser = useMutation({
    mutationFn: async ({ userId, banned }: { userId: string; banned: boolean }) => { await banFn({ data: { userId, banned } }); },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success(v.banned ? "Benutzer gesperrt" : "Benutzer aktiviert"); },
    onError: (e: any) => toast.error(e.message),
  });
  const resetPw = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => { await resetPwFn({ data: { userId, password } }); },
    onSuccess: () => toast.success("Passwort zurückgesetzt"),
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
  const isBannedUser = (u: any) => !!u.banned_until && new Date(u.banned_until) > new Date();
  const stats = {
    users: users.data?.length ?? 0,
    requests: pendingRequests.length,
    banned: (users.data ?? []).filter(isBannedUser).length,
    noRole: (users.data ?? []).filter((u: any) => (u.roles ?? []).length === 0).length,
  };

  const [tab, setTab] = useState<"team" | "roles">("team");
  const [search, setSearch] = useState("");
  const [locFilter, setLocFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const propsQ = useQuery({
    queryKey: ["team-properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const memberPropsQ = useQuery({
    queryKey: ["member-props-all", (users.data ?? []).map((u: any) => u.user_id).join(",")],
    enabled: !!users.data,
    queryFn: async () => {
      const out: Record<string, string[]> = {};
      await Promise.all((users.data ?? []).map(async (u: any) => {
        const { data } = await (supabase as any).rpc("admin_get_member_properties", { _user_id: u.user_id });
        out[u.user_id] = (data ?? []).map((r: any) => r.property_id);
      }));
      return out;
    },
  });
  const propName = (id: string) => propsQ.data?.find((p: any) => p.id === id)?.name ?? "—";
  const hasAllAccess = (roles: AppRole[]) => roles.some((r) => r === "owner" || r === "admin");

  const filtered = (users.data ?? []).filter((u: any) => {
    const q = search.trim().toLowerCase();
    if (q && !`${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q)) return false;
    if (roleFilter !== "all" && !(u.roles ?? []).includes(roleFilter)) return false;
    if (locFilter !== "all" && !hasAllAccess(u.roles ?? []) && !(memberPropsQ.data?.[u.user_id] ?? []).includes(locFilter)) return false;
    return true;
  });
  const selected = (users.data ?? []).find((u: any) => u.user_id === selectedId) ?? null;

  return (
    <AppShell title="Team & Rollen" subtitle="Zuständigkeiten klar verteilen">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard highlight icon={<Users className="w-4 h-4" />} label="Benutzer" value={stats.users} />
        <StatCard icon={<Inbox className="w-4 h-4" />} label="Offene Anfragen" value={stats.requests} />
        <StatCard icon={<Lock className="w-4 h-4" />} label="Gesperrt" value={stats.banned} />
        <StatCard icon={<UserX className="w-4 h-4" />} label="Ohne Rolle" value={stats.noRole} />
      </div>

      {pendingRequests.length > 0 && (
        <Section title={`Offene Zugriffsanfragen (${pendingRequests.length})`}>
          <div className="space-y-2">
            {pendingRequests.map((r: any) => {
              const user = (users.data ?? []).find((u: any) => u.user_id === r.user_id);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
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

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 border-b border-border">
          <div className="flex gap-5">
            {([["team", "Team"], ["roles", "Rollen & Rechte"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {l}
              </button>
            ))}
          </div>
          {tab === "team" && (
            <Button size="sm" className="mb-2" onClick={() => setCreateOpen(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1" /> Mitarbeitende hinzufügen
            </Button>
          )}
        </div>

        {tab === "team" ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3 p-4">
              <Select value={locFilter} onValueChange={setLocFilter}>
                <SelectTrigger className="rounded-xl"><Building2 className="w-4 h-4 mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Standorte</SelectItem>
                  {propsQ.data?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="rounded-xl"><Shield className="w-4 h-4 mr-1 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Rollen</SelectItem>
                  {ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name suchen…"
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-input bg-card text-sm" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Mitarbeitende</th>
                    <th className="text-left px-4 py-2.5 font-medium">Rolle</th>
                    <th className="text-left px-4 py-2.5 font-medium">Standorte</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u: any) => {
                    const isBanned = isBannedUser(u);
                    const locs = memberPropsQ.data?.[u.user_id] ?? [];
                    const isSel = selectedId === u.user_id;
                    return (
                      <tr key={u.user_id} onClick={() => setSelectedId(u.user_id)}
                        className={`border-t border-border cursor-pointer transition-colors ${isSel ? "bg-primary/5" : "hover:bg-accent/40"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Initials name={u.full_name || u.email} />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{u.full_name || "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(u.roles ?? []).length === 0 && <span className="text-xs text-muted-foreground">Keine Rolle</span>}
                            {(u.roles as AppRole[]).map((r) => <Badge key={r} tone={ROLE_TONE[r]}>{ROLE_LABEL[r]}</Badge>)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {hasAllAccess(u.roles ?? []) ? (
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Alle Standorte</span>
                          ) : locs.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Nicht zugewiesen</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="rounded-md bg-muted px-2 py-0.5 text-xs truncate max-w-[160px]">{propName(locs[0])}</span>
                              {locs.length > 1 && <span className="rounded-md bg-primary/10 text-primary px-1.5 py-0.5 text-xs">+{locs.length - 1}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isBanned ? <Badge tone="destructive">Gesperrt</Badge> : <Badge tone="success">Aktiv</Badge>}
                        </td>
                        <td className="px-2 text-muted-foreground"><ChevronRight className="w-4 h-4" /></td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">Keine Mitarbeitenden gefunden.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">{filtered.length} von {users.data?.length ?? 0} Mitarbeitenden · Zeile anklicken für Details</div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <div className="px-4 py-2 text-xs text-muted-foreground">Klicke auf eine Zelle, um die Berechtigung umzuschalten.</div>
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
                              <button disabled={isOwner}
                                onClick={() => setRolePerm.mutate({ role: r, permission: p.key, allowed: !on })}
                                className={`w-7 h-7 rounded-md border transition-colors ${on ? "bg-success/15 border-success/40 text-success" : "bg-muted/40 border-border text-muted-foreground/50"} ${isOwner ? "opacity-60 cursor-not-allowed" : "hover:opacity-80"}`}
                                title={isOwner ? "Inhaber hat immer alle Rechte" : on ? "Erlaubt" : "Verweigert"}>
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
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (() => {
            const u = selected;
            const isBanned = isBannedUser(u);
            const isSelf = u.user_id === currentUserId;
            const missing = ALL_ROLES.filter((r) => !u.roles.includes(r));
            const locs = memberPropsQ.data?.[u.user_id] ?? [];
            return (
              <div className="space-y-6">
                <SheetHeader>
                  <div className="flex items-center gap-4">
                    <Initials name={u.full_name || u.email} big />
                    <div className="min-w-0">
                      <SheetTitle className="truncate">{u.full_name || "—"}</SheetTitle>
                      <div className="mt-1">{isBanned ? <Badge tone="destructive">Gesperrt</Badge> : <Badge tone="success">Aktiv</Badge>}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {u.email}</div>
                    </div>
                  </div>
                </SheetHeader>

                <PanelSection title="Rollen">
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.length === 0 && <span className="text-xs text-muted-foreground">Keine Rolle</span>}
                    {(u.roles as AppRole[]).map((r) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded-full border border-border pl-2 pr-1 py-0.5 text-xs">
                        <Shield className="w-3 h-3" /> {ROLE_LABEL[r]}
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </span>
                    ))}
                  </div>
                  {missing.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      <Select value={adding?.userId === u.user_id ? adding.role : missing[0]} onValueChange={(v) => setAdding({ userId: u.user_id, role: v as AppRole })}>
                        <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{missing.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => addRole.mutate({ userId: u.user_id, role: adding?.userId === u.user_id ? adding.role : missing[0] })}>
                        <Shield className="w-3 h-3 mr-1" /> {t("teamSafety.changeRole")}
                      </Button>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{t("teamSafety.coreRoles")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("teamSafety.chief")}</p>
                </PanelSection>

                <PanelSection title="Zugewiesene Standorte" action={!hasAllAccess(u.roles) ? <PropertyAccessDialog userId={u.user_id} userName={u.full_name || u.email} /> : undefined}>
                  {hasAllAccess(u.roles) ? (
                    <div className="text-sm text-muted-foreground">Alle Standorte (Inhaber/Admin)</div>
                  ) : locs.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Noch kein Standort zugewiesen.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {locs.map((id) => (
                        <div key={id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                          <Building2 className="w-4 h-4 text-primary" /> {propName(id)}
                        </div>
                      ))}
                    </div>
                  )}
                </PanelSection>

                <UserWorkHours userId={u.user_id} />
                <EmployeeAttendance userId={u.user_id} />
                <UserActivity userId={u.user_id} />

                <PanelSection title="Zugang & Sicherheit">
                  <div className="flex flex-wrap gap-2">
                    <UserPermsDialog userId={u.user_id} userName={u.full_name || u.email} roles={u.roles} userPerms={userPermsQ.data ?? []} rolePerm={rolePerm} onChange={() => qc.invalidateQueries({ queryKey: ["user-perms"] })} />
                    <ResetPasswordButton onSubmit={(pw) => resetPw.mutate({ userId: u.user_id, password: pw })} />
                    <Button size="sm" variant="outline" disabled={isSelf || banUser.isPending}
                      onClick={() => banUser.mutate({ userId: u.user_id, banned: !isBanned })}>
                      {isBanned ? <><Unlock className="w-3.5 h-3.5 mr-1" /> Freigeben</> : <><Lock className="w-3.5 h-3.5 mr-1" /> Sperren</>}
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10"
                      disabled={isSelf || (!iAmOwner && (u.roles.includes("admin") || u.roles.includes("owner")))}
                      onClick={() => setDeleteTarget(u)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Löschen
                    </Button>
                  </div>
                  {isSelf && <div className="text-xs text-muted-foreground mt-2">Eigenes Konto kann nicht gesperrt oder gelöscht werden.</div>}
                  {(u.roles.includes("admin") || u.roles.includes("owner")) && !isSelf && (
                    <div className="mt-3 flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                      <span>Administratoren und Inhaber kann nur der <b>Inhaber</b> löschen.{!iAmOwner && " Du hast dafür keine Berechtigung."}</span>
                    </div>
                  )}
                </PanelSection>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      <DeleteUserDialog
        user={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(id) => { deleteUser.mutate(id); setDeleteTarget(null); setSelectedId(null); }}
      />

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (payload) => {
          await createFn({ data: payload });
          qc.invalidateQueries({ queryKey: ["admin-users"] });
          qc.invalidateQueries({ queryKey: ["cleaners"] });
          toast.success("Benutzer angelegt");
          setCreateOpen(false);
        }}
      />
    </AppShell>
  );
}

function DeleteUserDialog({ user, onClose, onConfirm }: { user: any | null; onClose: () => void; onConfirm: (id: string) => void }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const [finalStep, setFinalStep] = useState(false);
  const name = (user?.full_name || user?.email || "").trim();
  const isPrivileged = !!user && (user.roles.includes("admin") || user.roles.includes("owner"));
  const ok = deletionNameMatches(typed, name);
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { setTyped(""); setFinalStep(false); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Benutzer endgültig löschen</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>Das Konto von <b>{name}</b> wird dauerhaft gelöscht und kann nicht wiederhergestellt werden. Für eine vorübergehende Sperre nutze lieber „Sperren“.</p>
          {isPrivileged && (
            <div className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              <span>Diese Person ist Administrator/Inhaber. Nur der Inhaber darf sie löschen.</span>
            </div>
          )}
          {finalStep && <p className="border border-destructive/40 bg-destructive/10 p-3 font-medium text-destructive">{t("teamSafety.confirmAgain")}</p>}
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Zur Bestätigung den Namen eingeben: <b className="text-foreground">{name}</b></span>
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
              className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setTyped(""); setFinalStep(false); onClose(); }}>Abbrechen</Button>
          <Button variant="destructive" disabled={!ok} onClick={() => { if (!finalStep) { setFinalStep(true); setTyped(""); return; } setTyped(""); setFinalStep(false); onConfirm(user.user_id); }}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> {finalStep ? t("common.delete") : t("teamSafety.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Initials({ name, big }: { name: string; big?: boolean }) {
  const ini = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return <div className={`shrink-0 rounded-full bg-primary/10 text-primary font-semibold grid place-items-center ${big ? "w-16 h-16 text-xl" : "w-9 h-9 text-xs"}`}>{ini || "?"}</div>;
}

function PanelSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function UserWorkHours({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["team-user-hours", userId],
    queryFn: async () => {
      const { data: cl } = await supabase.from("cleaners").select("id").eq("user_id", userId).maybeSingle();
      if (!cl) return null;
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data, error } = await supabase.from("time_entries")
        .select("id,clock_in_at,clock_out_at,break_minutes,status,properties(name)")
        .eq("cleaner_id", cl.id).gte("clock_in_at", since).order("clock_in_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
  const mins = (e: any) => e.clock_out_at ? Math.max(0, (new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime()) / 60000 - (e.break_minutes ?? 0)) : 0;
  const total = (q.data ?? []).reduce((s: number, e: any) => s + mins(e), 0);
  const fmt = (d: string) => new Date(d).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <PanelSection title="Arbeitszeiten (14 Tage)" action={q.data ? <span className="text-xs font-semibold text-primary">{(total / 60).toFixed(1)} Std.</span> : undefined}>
      {q.isLoading ? <div className="text-sm text-muted-foreground">Lädt…</div>
        : q.data === null ? <div className="text-sm text-muted-foreground">Keine Zeiterfassung für dieses Konto.</div>
        : q.data!.length === 0 ? <div className="text-sm text-muted-foreground">Keine Einträge in den letzten 14 Tagen.</div>
        : (
          <div className="space-y-1">
            {q.data!.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-accent/40">
                <div className="flex items-center gap-2 min-w-0"><Clock className="w-3.5 h-3.5 text-primary shrink-0" /><span className="truncate">{fmt(e.clock_in_at)} · {e.properties?.name ?? "—"}</span></div>
                <span className="tabular-nums text-xs text-muted-foreground shrink-0">{e.clock_out_at ? `${(mins(e) / 60).toFixed(1)} Std.` : "läuft"}</span>
              </div>
            ))}
          </div>
        )}
    </PanelSection>
  );
}

function UserActivity({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["team-user-activity", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("audit_logs")
        .select("id,entity,action,created_at").eq("actor_id", userId).order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <PanelSection title="Letzte Aktivitäten">
      {q.isLoading ? <div className="text-sm text-muted-foreground">Lädt…</div>
        : (q.data ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Keine Aktivitäten protokolliert.</div>
        : (
          <div className="space-y-1">
            {q.data.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm px-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0"><History className="w-3.5 h-3.5 text-primary shrink-0" /><span className="truncate">{l.entity} · {l.action}</span></div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        )}
    </PanelSection>
  );
}

function ResetPasswordButton({ onSubmit }: { onSubmit: (pw: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Passwort zurücksetzen"><KeyRound className="w-3.5 h-3.5 mr-1" /> Passwort</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Neues Passwort setzen</DialogTitle></DialogHeader>
        <input type="text" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="Mind. 8 Zeichen"
          className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button disabled={pw.length < 8} onClick={() => { onSubmit(pw); setOpen(false); setPw(""); }}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (p: { email: string; password: string; full_name?: string; role?: AppRole }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole | "none">("reception");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onCreate({ email, password, full_name: fullName || undefined, role: role === "none" ? undefined : role });
      setEmail(""); setPassword(""); setFullName(""); setRole("reception");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Neuen Benutzer anlegen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Voller Name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">E-Mail *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Passwort * (mind. 8 Zeichen)</span>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Startrolle</span>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Rolle</SelectItem>
                {ALL_ROLES.filter((r) => r !== "owner").map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button disabled={busy || !email || password.length < 8} onClick={submit}>Anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      const { data: orgId } = await supabase.rpc("active_organization_id");
      if (!orgId) throw new Error("Keine eindeutige Organisation");
      await (supabase as any).from("user_permissions").upsert({ organization_id: orgId, user_id: userId, permission, allowed, updated_at: new Date().toISOString() }, { onConflict: "organization_id,user_id,permission" });
    }
    onChange();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Shield className="w-3.5 h-3.5 mr-1" /> Rechte</Button>
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

function PropertyAccessDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const qc = useQueryClient();
  const props = useQuery({
    queryKey: ["team-properties"], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const current = useQuery({
    queryKey: ["member-props", userId], enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_get_member_properties", { _user_id: userId });
      if (error) throw error;
      const s = new Set<string>((data ?? []).map((r: any) => r.property_id));
      setSel(s);
      return s;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("admin_set_member_properties", { _user_id: userId, _property_ids: Array.from(sel ?? []) });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["member-props", userId] }); qc.invalidateQueries({ queryKey: ["member-props-all"] }); toast.success("Zuweisung gespeichert"); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s ?? []); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Standorte zuweisen">Bearbeiten</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Häuser für {userName}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Rezeption und Objektleitung sehen nur die hier ausgewählten Häuser. Reinigungskräfte sehen zusätzlich Häuser mit zugewiesenen Aufgaben.</p>
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {(props.isLoading || current.isLoading) && <div className="text-sm text-muted-foreground">Lädt…</div>}
          {props.data?.map((p: any) => (
            <label key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-muted/40">
              <input type="checkbox" checked={sel?.has(p.id) ?? false} onChange={() => toggle(p.id)} />
              <span className="text-sm">{p.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button disabled={save.isPending || !sel} onClick={() => save.mutate()}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl px-5 py-4 shadow-sm ${highlight ? "brand-tile" : "border border-border bg-card"}`}>
      <div className={`flex items-center gap-1.5 text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{icon} {label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
