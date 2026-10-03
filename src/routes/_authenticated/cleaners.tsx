import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { Phone, Plus, Pencil, Trash2, Link2, Unlink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  head: () => ({ meta: [{ title: "Cleaners — Pensify" }] }),
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

type AdminUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  roles: string[];
};

function CleanersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<CleanerRow> | null>(null);
  const [deleting, setDeleting] = useState<CleanerRow | null>(null);
  const [linking, setLinking] = useState<CleanerRow | null>(null);

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

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });

  const save = useMutation({
    mutationFn: async (c: Partial<CleanerRow>) => {
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
        const { error } = await supabase.from("cleaners").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleaners"] });
      setEditing(null);
      toast.success("Gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cleaners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleaners"] });
      setDeleting(null);
      toast.success("Gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const link = useMutation({
    mutationFn: async ({ cleanerId, userId }: { cleanerId: string; userId: string | null }) => {
      const { error } = await supabase.rpc("admin_link_cleaner", {
        _cleaner_id: cleanerId,
        _user_id: userId as string,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleaners"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setLinking(null);
      toast.success("Verknüpfung aktualisiert");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const list = cleaners.data ?? [];

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
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((c) => {
          const linkedUser = users.data?.find((u) => u.user_id === c.user_id);
          return (
            <div key={c.id} className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-semibold">
                  {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold tracking-tight">{c.full_name}</h3>
                    <Badge tone={c.active ? "success" : "muted"}>{c.active ? "Aktiv" : "Inaktiv"}</Badge>
                    {c.user_id ? (
                      <Badge tone="success">Verknüpft</Badge>
                    ) : (
                      <Badge tone="warning">Kein Konto</Badge>
                    )}
                  </div>
                  {c.phone && (
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </div>
                  )}
                  {linkedUser && (
                    <div className="mt-1 text-xs text-muted-foreground">{linkedUser.email}</div>
                  )}
                </div>
              </div>
              {c.hourly_rate != null && (
                <div className="mt-3 text-sm">
                  Stundenlohn: <strong>€{Number(c.hourly_rate).toFixed(2)}</strong>
                </div>
              )}
              {c.notes && <div className="mt-2 text-xs text-muted-foreground">{c.notes}</div>}
              <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                  <Pencil className="w-3 h-3 mr-1" /> Bearbeiten
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLinking(c)}>
                  {c.user_id ? <Unlink className="w-3 h-3 mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
                  Konto verknüpfen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                  <Trash2 className="w-3 h-3 mr-1" /> Löschen
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editing.full_name ?? ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefon</Label>
                  <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div>
                  <Label>E-Mail</Label>
                  <Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Stundenlohn (€)</Label>
                  <Input type="number" step="0.01" value={editing.hourly_rate ?? ""} onChange={(e) => setEditing({ ...editing, hourly_rate: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={String(editing.active ?? true)} onValueChange={(v) => setEditing({ ...editing, active: v === "true" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Aktiv</SelectItem>
                      <SelectItem value="false">Inaktiv</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notiz</Label>
                <Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.full_name || save.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link dialog */}
      <Dialog open={!!linking} onOpenChange={(o) => !o && setLinking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benutzerkonto verknüpfen</DialogTitle>
          </DialogHeader>
          {linking && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {linking.full_name} — muss mit einem Benutzerkonto verknüpft sein, um per QR einzustempeln.
                Die Person muss sich zuerst unter <code>/auth</code> registrieren.
              </p>
              <Select
                value={linking.user_id ?? "none"}
                onValueChange={(v) => link.mutate({ cleanerId: linking.id, userId: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Benutzer wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nicht verknüpft —</SelectItem>
                  {users.data?.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name || u.email} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitarbeiter löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.full_name} wird endgültig gelöscht. Auch vergangene Zeit-Einträge werden entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
