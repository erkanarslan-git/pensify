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
  owner: "Inhaber",
  admin: "Administrator",
  manager: "Manager",
  cleaner: "Reinigungskraft",
};

const ROLE_TONE: Record<AppRole, "success" | "warning" | "muted" | "destructive"> = {
  owner: "destructive",
  admin: "warning",
  manager: "success",
  cleaner: "muted",
};

// Feste Berechtigungen pro Rolle. Anpassbar durch den Inhaber.
const PERMISSIONS: { key: string; label: string; roles: AppRole[] }[] = [
  { key: "view_calendar", label: "Kalender ansehen", roles: ["owner", "admin", "manager", "cleaner"] },
  { key: "create_reservation", label: "Buchungen erstellen / bearbeiten", roles: ["owner", "admin", "manager"] },
  { key: "delete_reservation", label: "Buchungen löschen", roles: ["owner", "admin"] },
  { key: "manage_rooms", label: "Zimmer & Pensionen verwalten", roles: ["owner", "admin"] },
  { key: "assign_cleaning", label: "Reinigung zuweisen", roles: ["owner", "admin", "manager"] },
  { key: "do_cleaning", label: "Eigene Reinigungsaufträge bearbeiten", roles: ["owner", "admin", "manager", "cleaner"] },
  { key: "view_finance", label: "Umsatz & Abrechnung ansehen", roles: ["owner", "admin", "manager"] },
  { key: "pay_cleaners", label: "Lohn freigeben / als bezahlt markieren", roles: ["owner", "admin"] },
  { key: "manage_team", label: "Team & Rollen verwalten", roles: ["owner", "admin"] },
  { key: "manage_settings", label: "Einstellungen ändern", roles: ["owner", "admin"] },
  { key: "manage_integrations", label: "Kanal-Integrationen (Booking/Airbnb/Check24)", roles: ["owner", "admin"] },
];

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
      toast.success("Rolle vergeben");
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
      toast.success("Rolle entfernt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Team & Rollen"
      subtitle="Weise Benutzern Rollen zu. Neue Personen müssen sich zuerst unter /auth registrieren."
    >
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Benutzer</th>
              <th className="text-left p-3">E-Mail</th>
              <th className="text-left p-3">Rollen</th>
              <th className="text-right p-3 w-32">Aktion</th>
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
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeRole.mutate({ userId: u.user_id, role: r })}
                            title="Rolle entfernen"
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
                          <Plus className="w-3 h-3 mr-1" /> Rolle
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

      {/* Berechtigungen-Übersicht */}
      <div className="mt-6 rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold">Berechtigungen pro Rolle</div>
          <div className="text-xs text-muted-foreground">Feste Standardrechte — Inhaber kann sie jederzeit anpassen.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Berechtigung</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="p-3 text-center">{ROLE_LABEL[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.key} className="border-t border-border">
                  <td className="p-3">{p.label}</td>
                  {ALL_ROLES.map((r) => (
                    <td key={r} className="p-3 text-center">
                      {p.roles.includes(r) ? <span className="text-success">✓</span> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
