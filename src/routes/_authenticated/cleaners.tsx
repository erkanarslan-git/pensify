import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { Mail, Phone, Plus, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
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
    onError: () => toast.error("Kayıt tamamlanamadı. E-posta adresini ve bilgileri kontrol edin."),
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
      <div className="overflow-hidden border border-border bg-card">
        <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_130px_110px_150px] gap-4 border-b border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span>Personel</span><span>İletişim</span><span>Saat ücreti</span><span>Durum</span><span className="text-right">İşlem</span>
        </div>
        {list.map((c) => {
          return (
            <div key={c.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_130px_110px_150px] md:items-center">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold">
                  {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0"><div className="truncate font-medium">{c.full_name}</div><div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">{c.user_id ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}{c.user_id ? "Giriş hesabı aktif" : "Eski kayıt · giriş hesabı yok"}</div></div>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">{c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{c.phone}</div>}{c.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{c.email}</div>}</div>
              <div className="text-sm font-medium">{c.hourly_rate == null ? "—" : `€${Number(c.hourly_rate).toFixed(2)}`}</div>
              <div><Badge tone={c.active ? "success" : "muted"}>{c.active ? "Aktif" : "Pasif"}</Badge></div>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                  <Pencil className="w-3 h-3 mr-1" /> Düzenle
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                  <Trash2 className="w-3 h-3" />
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
            <DialogTitle>{editing?.id ? "Personeli düzenle" : "Yeni temizlik personeli"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editing.full_name ?? ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
              </div>
              {!editing.id && <div className="rounded-md border border-border bg-muted p-3 space-y-3"><div><p className="text-sm font-medium">Giriş bilgileri</p><p className="text-xs text-muted-foreground">Bu bilgilerle personel doğrudan temizlik hesabına giriş yapar.</p></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>E-posta</Label><Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div><div><Label>Geçici şifre</Label><Input type="text" minLength={8} value={editing.password ?? ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></div></div></div>}
              <div className={`grid gap-3 ${editing.id ? "grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <Label>Telefon</Label>
                  <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                {editing.id && <div>
                  <Label>E-Mail</Label>
                  <Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>}
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
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.full_name || (!editing.id && (!editing.email || (editing.password?.length ?? 0) < 8)) || save.isPending}>
              Speichern
            </Button>
          </DialogFooter>
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
