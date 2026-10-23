import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";

export const DEPARTMENTS = ["cleaning", "maintenance", "office", "hr"] as const;
type Dept = (typeof DEPARTMENTS)[number];
const POWERS = [
  ["assign", "lead_can_assign"],
  ["time", "lead_can_fix_time"],
  ["absence", "lead_can_absence"],
] as const;

type Row = {
  id: string; department: Dept; is_worker: boolean; is_lead: boolean;
  lead_can_assign: boolean; lead_can_fix_time: boolean; lead_can_absence: boolean; lead_can_report: boolean;
};

export function MemberDepartments({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ["member-departments", userId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: orgId } = await supabase.rpc("active_organization_id");
      const { data: m } = await supabase.from("organization_members").select("id")
        .eq("user_id", userId).eq("organization_id", orgId as string).maybeSingle();
      if (!m) return { memberId: null as string | null, rows: [] as Row[] };
      const { data, error } = await (supabase as any).from("member_departments").select("*").eq("member_id", m.id);
      if (error) throw error;
      return { memberId: m.id as string, rows: (data ?? []) as Row[] };
    },
  });

  async function save(dept: Dept, patch: Partial<Row>) {
    const memberId = q.data?.memberId;
    if (!memberId) return;
    const cur = q.data?.rows.find((r) => r.department === dept);
    const next = { is_worker: cur?.is_worker ?? false, is_lead: cur?.is_lead ?? false, ...patch };
    const db = supabase as any;
    let error;
    if (!next.is_worker && !next.is_lead) {
      if (cur) ({ error } = await db.from("member_departments").delete().eq("id", cur.id));
    } else if (cur) {
      ({ error } = await db.from("member_departments").update({ ...patch, ...next }).eq("id", cur.id));
    } else {
      ({ error } = await db.from("member_departments").insert({ member_id: memberId, department: dept, organization_id: "00000000-0000-0000-0000-000000000000", ...next, ...patch }));
    }
    if (error) { toast.error(error.message); return; }
    toast.success(t("departments.saved"));
    await Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["report-access"] }),
      qc.invalidateQueries({ queryKey: ["work-report"] }),
    ]);
  }

  if (q.isLoading) return null;
  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold">{t("departments.title")}</div>
        <div className="text-xs text-muted-foreground">{t("departments.hint")}</div>
      </div>
      {!q.data?.memberId ? (
        <div className="text-xs text-muted-foreground">{t("departments.needMember")}</div>
      ) : (
        <div className="space-y-2">
          {DEPARTMENTS.map((d) => {
            const r = q.data?.rows.find((x) => x.department === d);
            return (
              <div key={d} className="rounded-xl border border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="min-w-28 text-sm font-medium">{t(`departments.${d}`)}</span>
                  {d === "hr" ? (
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={!!r} onCheckedChange={(v) => save(d, { is_worker: !!v, is_lead: false })} />
                      {t("departments.hr")}
                    </label>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox checked={!!r?.is_worker} onCheckedChange={(v) => save(d, { is_worker: !!v })} />
                        {t("departments.worker")}
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox checked={!!r?.is_lead} onCheckedChange={(v) => save(d, { is_lead: !!v })} />
                        {t("departments.lead")}
                      </label>
                    </>
                  )}
                </div>
                {r && r.is_lead && d !== "hr" && (
                  <div className="mt-2 border-t border-border pt-2">
                    <div className="mb-1 text-[11px] uppercase text-muted-foreground">{t("departments.powers")}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {POWERS.map(([k, col]) => (
                        <label key={k} className="flex items-center gap-1.5 text-xs">
                          <Checkbox checked={r[col]} onCheckedChange={(v) => save(d, { [col]: !!v } as Partial<Row>)} />
                          {t(`departments.${k}`)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RoleGuide() {
  const { t } = useTranslation();
  const keys = ["owner", "admin", "manager", "reception", "cleaner", "cleaning", "maintenance", "office", "hr", "lead"];
  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">{t("departments.explainTitle")}</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {keys.map((k) => (
          <div key={k} className="rounded-xl bg-muted/40 p-3">
            <dt className="text-sm font-medium">{["owner", "admin", "manager", "reception", "cleaner"].includes(k) ? t(`roles.${k}`) : t(`departments.${k}`)}</dt>
            <dd className="text-xs text-muted-foreground">{t(`departments.explain.${k}`)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
