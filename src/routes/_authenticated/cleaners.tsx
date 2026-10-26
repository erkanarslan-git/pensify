import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { DepartmentStaff } from "@/components/department-staff";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Phone, Plus, Pencil, Trash2, UserCheck, UserX, Users, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser } from "@/lib/admin-users.functions";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmployeeAttendance } from "@/components/employee-attendance";
import { CalendarDays } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { deletionNameMatches } from "@/lib/team-safety";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/cleaners")({
  head: () => ({ meta: [
    { title: "Personal — Pension Highway" },
    { name: "description", content: "Personal für Reinigung, Wartung und Büro im Überblick." },
    { property: "og:title", content: "Personal — Pension Highway" },
    { property: "og:description", content: "Personal für Reinigung, Wartung und Büro im Überblick." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CleanersPage,
});

type CleanerRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  hourly_rate?: number | null;
  notes: string | null;
};

function CleanersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("manage_team");
  const [department, setDepartment] = useState("cleaning");
  const [confirmName, setConfirmName] = useState("");
  const [editing, setEditing] = useState<(Partial<CleanerRow> & { password?: string }) | null>(null);
  const [deleting, setDeleting] = useState<CleanerRow | null>(null);
  const [attendanceUser, setAttendanceUser] = useState<CleanerRow | null>(null);
  const createUser = useServerFn(adminCreateUser);

  const cleaners = useQuery({
    queryKey: ["cleaners"],
    queryFn: async () => {
      const [{ data, error }, ratesRes] = await Promise.all([
        supabase.rpc("list_team_cleaners"),
        canManage ? supabase.rpc("admin_list_cleaner_rates") : Promise.resolve({ data: [], error: null }),
      ]);
      if (error) throw error;
      const rateMap = new Map<string, number | null>();
      if (!ratesRes.error && Array.isArray(ratesRes.data)) {
        for (const r of ratesRes.data as { id: string; hourly_rate: number | null }[]) {
          rateMap.set(r.id, r.hourly_rate);
        }
      }
      return (data ?? []).map((c) => ({ ...c, hourly_rate: rateMap.get(c.id) ?? null })) as CleanerRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (c: Partial<CleanerRow> & { password?: string }) => {
      const payload = {
        full_name: c.full_name?.trim() ?? "",
        phone: c.phone || null,
        email: c.email || null,
        hourly_rate: c.hourly_rate ?? null,
        active: c.active ?? true,
        notes: c.notes || null,
      };
      if (c.id) {
        const { error } = await supabase.from("cleaners").update(payload).eq("id", c.id);
        if (error) throw error;
      } else {
        if (!c.email || !c.password) throw new Error("E-Mail und Passwort sind erforderlich.");
        await createUser({ data: {
          email: c.email,
          password: c.password,
          full_name: c.full_name,
          role: "cleaner",
          cleaner: { phone: c.phone ?? undefined, hourly_rate: c.hourly_rate, notes: c.notes ?? undefined },
        } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleaners"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditing(null);
      toast.success("Gespeichert");
    },
    onError: () => toast.error(t("cleaners.saveFailed")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cleaners").update({ active: false }).eq("id", id).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleaners"] });
      setDeleting(null);
      toast.success(t("common.saved", { defaultValue: "Gespeichert" }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const list = cleaners.data ?? [];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const shown = list.filter((c) =>
    (statusFilter === "all" || (statusFilter === "active" ? c.active : !c.active)) &&
    `${c.full_name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <AppShell
      title={t("departments.personnel")}
      actions={
        canManage ? <Button asChild size="sm"><Link to="/team"><Users className="w-4 h-4 mr-1" />{t("teamSafety.addInTeam")}</Link></Button> : undefined
      }
    >
      <Tabs value={department} onValueChange={setDepartment} className="mb-5">
        <TabsList className="w-full sm:w-auto">
          {["cleaning", "maintenance", "office"].map(d => <TabsTrigger key={d} value={d} className="flex-1">{t(`departments.${d}`)}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {department === "maintenance" || department === "office" ? <DepartmentStaff department={department} /> : <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <StaffStat highlight icon={<Users className="w-4 h-4" />} label={t("cleaners.active")} value={list.filter((c) => c.active).length} onClick={() => setStatusFilter("active")} />
        <StaffStat icon={<UserX className="w-4 h-4" />} label={t("cleaners.inactive")} value={list.filter((c) => !c.active).length} onClick={() => setStatusFilter("inactive")} />
        <StaffStat icon={<UserCheck className="w-4 h-4" />} label={t("cleaners.accountActive")} value={list.filter((c) => c.user_id).length} />
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-border">
          <div className="inline-flex rounded-xl bg-muted p-1">
            {(["all", "active", "inactive"] as const).map((k) => (
              <button key={k} onClick={() => setStatusFilter(k)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === k ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {k === "all" ? t("common.all", { defaultValue: "Alle" }) : k === "active" ? t("cleaners.active") : t("cleaners.inactive")}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search", { defaultValue: "Suchen…" })}
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-input bg-card text-sm" />
          </div>
        </div>
        <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_110px_150px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>{t("cleaners.staff")}</span><span>{t("cleaners.contact")}</span><span>{t("cleaners.status")}</span><span className="text-right">{t("cleaners.action")}</span>
        </div>
        {cleaners.isError && <p className="p-4 text-sm text-destructive">{t("teamSafety.loadFailed")}</p>}
        {!cleaners.isError && shown.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">—</div>}
        {shown.map((c) => (
          <div key={c.id} className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/40 transition-colors md:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_110px_150px] md:items-center ${c.active ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0"><div className="truncate font-medium">{c.full_name}</div><div className={`mt-0.5 flex items-center gap-1 text-xs ${c.user_id ? "text-primary" : "text-muted-foreground"}`}>{c.user_id ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}{c.user_id ? t("cleaners.accountActive") : t("cleaners.legacyNoAccount")}</div></div>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">{c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}{c.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5" />{c.email}</div>}</div>
            <div><Badge tone={c.active ? "success" : "muted"}>{c.active ? t("cleaners.active") : t("cleaners.inactive")}</Badge></div>
            <div className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" title={t("attendance.manage")} aria-label={t("attendance.manage")} onClick={() => setAttendanceUser(c)}><CalendarDays className="h-4 w-4" /></Button>
              {canManage && <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEditing(c)}>
                <Pencil className="w-3 h-3 mr-1" /> {t("common.edit")}
              </Button>}
              {canManage && c.active && <Button size="sm" variant="ghost" aria-label={t("teamSafety.deactivate")} title={t("teamSafety.deactivate")} className="rounded-lg hover:text-destructive" onClick={() => { setConfirmName(""); setDeleting(c); }}>
                <Trash2 className="w-3 h-3" />
              </Button>}
            </div>
          </div>
        ))}
      </div>

      </>}
      {/* Edit dialog */}
      <Dialog open={!!attendanceUser} onOpenChange={open => !open && setAttendanceUser(null)}>
        <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{attendanceUser?.full_name} · {t("attendance.title")}</DialogTitle></DialogHeader>{attendanceUser?.user_id ? <EmployeeAttendance userId={attendanceUser.user_id} /> : <p className="text-sm text-muted-foreground">{t("attendance.noMember")}</p>}</DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("cleaners.editStaff") : t("cleaners.newStaff")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>{t("cleaners.name")}</Label>
                <Input value={editing.full_name ?? ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
              </div>
              {!editing.id && <div className="rounded-md border border-border bg-muted p-3 space-y-3"><div><p className="text-sm font-medium">{t("cleaners.loginDetails")}</p><p className="text-xs text-muted-foreground">{t("cleaners.loginHint")}</p></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>{t("cleaners.email")}</Label><Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div><div><Label>{t("cleaners.temporaryPassword")}</Label><Input type="text" minLength={8} value={editing.password ?? ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></div></div></div>}
              <div className={`grid gap-3 ${editing.id ? "grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <Label>{t("cleaners.phone")}</Label>
                  <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                {editing.id && <div>
                  <Label>{t("cleaners.email")}</Label>
                  <Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("cleaners.hourlyRateEuro")}</Label>
                  <Input type="number" step="0.01" value={editing.hourly_rate ?? ""} onChange={(e) => setEditing({ ...editing, hourly_rate: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>{t("cleaners.status")}</Label>
                  <Select value={String(editing.active ?? true)} onValueChange={(v) => setEditing({ ...editing, active: v === "true" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">{t("cleaners.active")}</SelectItem>
                      <SelectItem value="false">{t("cleaners.inactive")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t("cleaners.notes")}</Label>
                <Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.full_name || (!editing.id && (!editing.email || (editing.password?.length ?? 0) < 8)) || save.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teamSafety.deactivate")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.full_name} · {t("teamSafety.deactivateHint")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label className="grid gap-2">{t("teamSafety.typeName")}<Input value={confirmName} onChange={e => setConfirmName(e.target.value)} /></Label>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={!deletionNameMatches(confirmName, deleting?.full_name ?? "") || remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>{t("teamSafety.deactivate")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function StaffStat({ icon, label, value, highlight, onClick }: { icon: React.ReactNode; label: string; value: number | string; highlight?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`text-left rounded-2xl px-5 py-4 shadow-sm transition ${highlight ? "brand-tile" : "border border-border bg-card"} ${onClick ? "hover:ring-2 hover:ring-primary/30" : "cursor-default"}`}>
      <div className={`flex items-center gap-1.5 text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{icon} {label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
    </button>
  );
}
