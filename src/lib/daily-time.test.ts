import { describe, expect, it } from 'vitest';
import { dailyTime, type DailyTimeEntry } from './daily-time';
const entry: DailyTimeEntry = { id: 'e', cleaner_id: 'c', clock_in_at: '2026-10-22T06:00:00Z', clock_out_at: '2026-10-22T14:00:00Z', break_minutes: 30, break_started_at: null, needs_review: false, properties: { name: 'Hotel' } };
describe('daily work ledger', () => {
  it('subtracts a break exactly once', () => expect(dailyTime([entry], '2026-10-22', 0).netMinutes).toBe(450));
  it('keeps empty days visible with no invented hours', () => expect(dailyTime([], '2026-10-22', 0).netMinutes).toBe(0));
  it('excludes unreviewed forgotten exits from confirmed time', () => expect(dailyTime([{ ...entry, needs_review: true }], '2026-10-22', 0).netMinutes).toBe(0));
  it('keeps overnight work on the Berlin start day', () => {
    const e = { ...entry, clock_in_at: '2026-10-22T22:30:00Z', clock_out_at: '2026-10-23T02:30:00Z' };
    expect(dailyTime([e], '2026-10-23', 0).netMinutes).toBe(210);
    expect(dailyTime([e], '2026-10-22', 0).sessions).toHaveLength(0);
  });
  it('includes an ongoing break once', () => expect(dailyTime([{ ...entry, clock_out_at: null, break_started_at: '2026-10-22T10:00:00Z' }], '2026-10-22', Date.parse('2026-10-22T10:15:00Z')).netMinutes).toBe(210));
});