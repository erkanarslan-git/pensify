export type AssignmentOption = { property_id: string; cleaner_id: string; full_name: string };
export function taskAssignmentOptions(options: AssignmentOption[], propertyId: string) {
  return options.filter((o) => o.property_id === propertyId);
}
export function canChangeCleaningAssignment(status: string) {
  return status === "pending" || status === "accepted";
}