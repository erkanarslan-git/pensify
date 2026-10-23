export type ShiftContext = {
  status: "employee" | "not_employee" | "no_membership";
  can_manage_team: boolean;
  cleaner?: { id: string; full_name: string } | null;
  open?: { id: string; property_id: string; clock_in_at: string; break_minutes: number; break_started_at: string | null; requires_exit_location?: boolean; properties: { name: string } } | null;
};

export function canStartShift(context: ShiftContext): boolean {
  return context.status === "employee" && Boolean(context.cleaner);
}