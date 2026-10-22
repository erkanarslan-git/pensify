import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reportTeams } from "@/lib/report-access";
import type { WorkItem } from "@/lib/work-report";

const Input = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  propertyId: z.string().uuid().optional(),
});

// The database resolves the caller's organization, departments and property access.
export const getWorkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("department_work_report", {
      _from: data.from, _to: data.to, ...(data.propertyId ? { _property: data.propertyId } : {}),
    });
    if (error) throw new Error(error.message);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Forbidden");
    const allowedTeams = reportTeams(result.allowedTeams);
    if (!allowedTeams.length) throw new Error("Forbidden");
    return {
      items: (Array.isArray(result.items) ? result.items : []) as unknown as WorkItem[],
      properties: (Array.isArray(result.properties) ? result.properties : []) as unknown as { id: string; name: string }[],
      allowedTeams, truncated: result.truncated === true,
    };
  });
