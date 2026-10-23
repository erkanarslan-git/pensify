import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { departmentRoster } from "@/lib/staff-roster";
import { Badge } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function DepartmentStaff({ department }: { department: "maintenance" | "office" }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["department-staff", department], queryFn: async () => {
    const { data: org, error: orgError } = await supabase.rpc("active_organization_id");
    if (orgError) throw orgError;
    if (!org) throw new Error("No organization");
    const [assignments, members] = await Promise.all([
      supabase.from("member_departments").select("member_id,department,is_worker,is_lead").eq("organization_id", org).eq("department", department),
      supabase.from("organization_members").select("id,user_id,active").eq("organization_id", org),
    ]);
    if (assignments.error) throw assignments.error;
    if (members.error) throw members.error;
    const ids = (members.data ?? []).map(m => m.user_id);
    const profiles = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    return departmentRoster(department, assignments.data ?? [], members.data ?? [], profiles.data ?? []);
  } });
  const rows = (q.data ?? []).filter(r => (r.full_name ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  return <div className="space-y-4">
    <Input aria-label={t("common.search")} placeholder={t("common.search")} value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
    {q.isError ? <p className="text-destructive text-sm">{t("teamSafety.loadFailed")}</p> : q.isPending ? <p className="text-muted-foreground">…</p> : rows.length === 0 ? <p className="text-muted-foreground text-sm py-6">{t("departments.emptyTeam")}</p> :
      <div className="divide-y divide-border">{rows.map(r => <div key={r.member_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <span className="font-medium">{r.full_name || t("departments.unnamed")}</span>
        <div className="flex flex-wrap gap-2">
          {r.is_worker && <Badge tone="info">{t("departments.worker")}</Badge>}
          {r.is_lead && <Badge tone="info">{t("departments.lead")}</Badge>}
          <Badge tone={r.active ? "success" : "muted"}>{t(r.active ? "cleaners.active" : "cleaners.inactive")}</Badge>
        </div>
      </div>)}</div>}
  </div>;
}