export const RESERVATION_TRASH_RETENTION_DAYS = 30;

/** Cancellation and deletion always need a meaningful, bounded reason. */
export function reservationActionReason(value: string | null | undefined): string | null {
  const reason = value?.trim() ?? "";
  return reason ? reason.slice(0, 500) : null;
}

export function reservationPurgeAllowed(purgeAt: string, now = new Date()): boolean {
  const timestamp = new Date(purgeAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}
