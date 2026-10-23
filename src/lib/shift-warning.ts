export const REVIEW_AFTER_HOURS = 16;

export function shiftNeedsWarning(start: string, now: number): boolean {
  const started = Date.parse(start);
  return Number.isFinite(started) && now - started > REVIEW_AFTER_HOURS * 60 * 60 * 1000;
}