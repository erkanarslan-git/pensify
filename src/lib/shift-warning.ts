export const REVIEW_AFTER_HOURS = 16;

export function shiftNeedsWarning(start: string, now: number, warningMinutes = 720): boolean {
  const started = Date.parse(start);
  return Number.isFinite(started) && Number.isFinite(warningMinutes) && warningMinutes >= 60 && now - started >= warningMinutes * 60000;
}