export function deletionNameMatches(typed: string, expected: string): boolean {
  return expected.trim().length > 0 && typed.trim() === expected.trim();
}

export function canDeleteTeamUser(callerId: string, targetId: string, callerRole: string, targetRole: string, ownerCount: number, otherMembershipCount: number): boolean {
  if (callerId === targetId || otherMembershipCount > 0) return false;
  if (targetRole === "owner" && ownerCount <= 1) return false;
  if ((targetRole === "owner" || targetRole === "admin") && callerRole !== "owner") return false;
  return callerRole === "owner" || callerRole === "admin";
}