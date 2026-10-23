export const ISSUE_CATEGORIES = ["damage", "plumbing", "electric", "missing", "dirty", "lock", "other"] as const;
export type InspectionState = "not_required" | "pending" | "approved" | "rejected";
export function cleaningNeedsReview(task: { status: string; inspection_state: InspectionState }) {
  return task.status === "completed" && task.inspection_state === "pending";
}
export function validCleaningReason(reason: string) { return reason.trim().length >= 3; }
export function validIssue(category: string, description: string) {
  return ISSUE_CATEGORIES.some((value) => value === category) && description.length <= 2000;
}