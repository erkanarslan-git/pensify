export interface MaintenanceIssue {
  id: string; room_id: string; room_number: string; property_name: string;
  property_id: string; category: string; description: string; created_at: string;
  reporter: string; assigned_to: string | null; assignee: string; assigner: string;
  assigned_at: string | null; can_assign: boolean;
}
export interface MaintenanceBoard {
  issues: MaintenanceIssue[];
  workers: { user_id: string; full_name: string }[];
}
export function maintenanceWorkerAllowed(workers: MaintenanceBoard["workers"], userId: string) {
  return userId === "" || workers.some((w) => w.user_id === userId);
}