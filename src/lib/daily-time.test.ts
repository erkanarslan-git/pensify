import { describe, expect, it } from 'vitest';
import { dailyTime, type DailyTimeEntry } from './daily-time';
const entry: DailyTimeEntry = { id: 'e', cleaner_id: 'c', clock_in_at: '2026-10-22T06:00:00Z', clock_out_at: '2026-10-22T14:00:00Z', break_minutes: 30, break_started_at: null, needs_review: false, properties: { name: 'Hotel' } };
describe('daily work ledger', () => {
  it('subtracts a break exactly once', () => expect(dailyTime([entry], '2026-10-22', 0).netMinutes).toBe(450));
  it('keeps empty days visible with no invented hours', () => expect(dailyTime([], '2026-10-22', 0).netMinutes).toBe(0));
  it('excludes unreviewed forgotten exits from confirmed time', () => expect(dailyTime([{ ...entry, needs_review: true }], '2026-10-22', 0).netMinutes).toBe(0));
  it('splits overnight work and timestamped breaks at Berlin midnight', () => {
    const e = { ...entry, clock_in_at: '2026-10-22T21:00:00Z', clock_out_at: '2026-10-23T01:00:00Z' };
    const pauses = [{ id: 'b', time_entry_id: 'e', started_at: '2026-10-22T21:45:00Z', ended_at: '2026-10-22T22:15:00Z' }];
    expect(dailyTime([e], '2026-10-22', 0, pauses).netMinutes).toBe(45);
    expect(dailyTime([e], '2026-10-23', 0, pauses).netMinutes).toBe(165);
    expect(dailyTime([e], '2026-10-22', 0, pauses).breakMinutes).toBe(15);
    expect(dailyTime([e], '2026-10-23', 0, pauses).breakMinutes).toBe(15);
  });
  it('keeps ongoing work out of confirmed totals', () => {
    const result = dailyTime([{ ...entry, clock_out_at: null, break_started_at: '2026-10-22T10:00:00Z' }], '2026-10-22', Date.parse('2026-10-22T10:15:00Z'));
    expect(result.netMinutes).toBe(0);
    expect(result.ongoingMinutes).toBe(210);
  });
  it('uses actual elapsed time across spring and autumn DST', () => {
    expect(dailyTime([{ ...entry, break_minutes: 0, clock_in_at: '2026-03-28T23:00:00Z', clock_out_at: '2026-03-29T22:00:00Z' }], '2026-03-29', 0).netMinutes).toBe(1380);
    expect(dailyTime([{ ...entry, break_minutes: 0, clock_in_at: '2026-10-24T22:00:00Z', clock_out_at: '2026-10-25T23:00:00Z' }], '2026-10-25', 0).netMinutes).toBe(1500);
  });
  it('does not duplicate overlapping break intervals', () => {
    const pauses = [{ id: 'a', time_entry_id: 'e', started_at: '2026-10-22T10:00:00Z', ended_at: '2026-10-22T10:30:00Z' }, { id: 'b', time_entry_id: 'e', started_at: '2026-10-22T10:15:00Z', ended_at: '2026-10-22T10:45:00Z' }];
    expect(dailyTime([entry], '2026-10-22', 0, pauses).netMinutes).toBe(435);
  });
  it('keeps review-only missing checkout out of active and confirmed work', () => {
    const result = dailyTime([{ ...entry, clock_out_at: null, needs_review: true }], '2026-10-22', Date.parse('2026-10-23T12:00:00Z'));
    expect(result.active).toBe(false);
    expect(result.netMinutes).toBe(0);
    expect(result.ongoingMinutes).toBe(0);
  });
});