export type StaffAssignment = { member_id: string; department: string; is_worker: boolean; is_lead: boolean };
export type StaffMember = { id: string; user_id: string; active: boolean };
export function departmentRoster(department: string, assignments: StaffAssignment[], members: StaffMember[], profiles: { id: string; full_name: string | null }[]) {
  const names = new Map(profiles.map(p => [p.id, p.full_name]));
  const people = new Map(members.map(m => [m.id, m]));
  return assignments.filter(a => a.department === department && (a.is_worker || a.is_lead)).flatMap(a => {
    const m = people.get(a.member_id);
    return m ? [{ ...a, user_id: m.user_id, active: m.active, full_name: names.get(m.user_id) ?? null }] : [];
  });
}