import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge } from "@/components/app-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Shield, Plus, X } from "lucide-react";
import { useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Pensify" }] }),
  component: TeamPage,
});

type AppRole = "owner" | "admin" | "manager" | "cleaner";
const ALL_ROLES: AppRole[] = ["owner", "admin", "manager", "cleaner"];

const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  manager: "Ofis personeli",
  cleaner: "Temizlikçi",
};

const ROLE_TONE: Record<AppRole, "success" | "warning" | "muted" | "destructive"> = {
  owner: "destructive",
  admin: "warning",
  manager: "success",
  cleaner: "muted",
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

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_set_role", { _user_id: userId, _role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setAdding(null);
      toast.success("Rol verildi");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_remove_role", { _user_id: userId, _role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Rol kaldırıldı");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Ekip & roller"
      subtitle="Kullanıcılara rol ata. Yeni kişi önce /auth sayfasından kayıt olmalı."
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Kullanıcı</th>
              <th className="text-left p-3">E-posta</th>
              <th className="text-left p-3">Roller</th>
              <th className="text-right p-3 w-32">İşlem</th>
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
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">Rol yok</span>}
                      {(u.roles as AppRole[]).map((r) => (
                        <span key={r} className="inline-flex items-center gap-1">
                          <Badge tone={ROLE_TONE[r]}>
                            <Shield className="w-3 h-3 mr-1 inline" />
                            {ROLE_LABEL[r]}
                          </Badge>
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeRole.mutate({ userId: u.user_id, role: r })}
                            title="Rolü kaldır"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right">
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
                          <Plus className="w-3 h-3 mr-1" /> Rol
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
