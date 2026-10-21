import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { Mail, Phone, Plus, Pencil, Trash2, UserCheck, UserX, Users, Euro, Search } from "lucide-react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/cleaners")({
  head: () => ({ meta: [
    { title: "Personal — Pensify" },
    { name: "description", content: "Reinigungspersonal und Zugangsdaten verwalten." },
    { property: "og:title", content: "Personal — Pensify" },
    { property: "og:description", content: "Reinigungspersonal und Zugangsdaten verwalten." },
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
  const [editing, setEditing] = useState<(Partial<CleanerRow> & { password?: string }) | null>(null);
  const [deleting, setDeleting] = useState<CleanerRow | null>(null);
  const createUser = useServerFn(adminCreateUser);

  const cleaners = useQuery({
    queryKey: ["cleaners"],
    queryFn: async () => {
      const [{ data, error }, ratesRes] = await Promise.all([
        supabase
          .from("cleaners")
          .select("id,user_id,full_name,phone,email,active,notes,created_at,updated_at")
          .order("created_at", { ascending: false }),
        supabase.rpc("admin_list_cleaner_rates"),
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
        full_name: c.full_name!,
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
      const { error } = await supabase.from("cleaners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleaners"] });
      setDeleting(null);
      toast.success(t("cleaners.deleted"));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const list = cleaners.data ?? [];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const shown = list.filter((c) =>
    (statusFilter === "all" || (statusFilter === "active" ? c.active : !c.active)) &&
    `${c.full_name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const rates = list.filter((c) => c.hourly_rate != null).map((c) => Number(c.hourly_rate));
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

  return (
    <AppShell
      title={t("pages.cleaners.title")}
      subtitle={t("pages.cleaners.subtitle", { count: list.filter((c) => c.active).length })}
      actions={
        <Button onClick={() => setEditing({ active: true })} size="sm">
          <Plus className="w-4 h-4 mr-1" /> {t("common.add")}
        </Button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StaffStat highlight icon={<Users className="w-4 h-4" />} label={t("cleaners.active")} value={list.filter((c) => c.active).length} onClick={() => setStatusFilter("active")} />
        <StaffStat icon={<UserX className="w-4 h-4" />} label={t("cleaners.inactive")} value={list.filter((c) => !c.active).length} onClick={() => setStatusFilter("inactive")} />
        <StaffStat icon={<UserCheck className="w-4 h-4" />} label={t("cleaners.accountActive")} value={list.filter((c) => c.user_id).length} />
        <StaffStat icon={<Euro className="w-4 h-4" />} label={t("cleaners.hourlyRate")} value={avgRate == null ? "—" : `€${avgRate.toFixed(2)}`} />
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
        <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_130px_110px_150px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>{t("cleaners.staff")}</span><span>{t("cleaners.contact")}</span><span>{t("cleaners.hourlyRate")}</span><span>{t("cleaners.status")}</span><span className="text-right">{t("cleaners.action")}</span>
        </div>
        {shown.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">—</div>}
        {shown.map((c) => (
          <div key={c.id} className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent/40 transition-colors md:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_130px_110px_150px] md:items-center ${c.active ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0"><div className="truncate font-medium">{c.full_name}</div><div className={`mt-0.5 flex items-center gap-1 text-xs ${c.user_id ? "text-primary" : "text-muted-foreground"}`}>{c.user_id ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}{c.user_id ? t("cleaners.accountActive") : t("cleaners.legacyNoAccount")}</div></div>
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">{c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}{c.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5" />{c.email}</div>}</div>
            <div className="text-sm font-semibold tabular-nums">{c.hourly_rate == null ? "—" : `€${Number(c.hourly_rate).toFixed(2)}`}</div>
            <div><Badge tone={c.active ? "success" : "muted"}>{c.active ? t("cleaners.active") : t("cleaners.inactive")}</Badge></div>
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEditing(c)}>
                <Pencil className="w-3 h-3 mr-1" /> {t("common.edit")}
              </Button>
              <Button size="sm" variant="ghost" className="rounded-lg hover:text-destructive" onClick={() => setDeleting(c)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit dialog */}
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
            <AlertDialogTitle>{t("cleaners.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cleaners.deleteDescription", { name: deleting?.full_name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)}>{t("common.delete")}</AlertDialogAction>
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
