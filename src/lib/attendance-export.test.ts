import { describe, it, expect } from 'vitest';
import { csvText, attendanceExportDays } from './attendance-export';
import type { DailyTimeEntry } from './daily-time';

describe('attendance CSV', () => {
  it('neutralizes formulas including whitespace and tab prefixes', () => {
    for (const input of ['=1+1', '+1', '-1', '@SUM(A1)', '  =1', '\t=1']) expect(csvText([[input]])).toContain(`"'${input}"`);
  });
  it('quotes names with semicolons and quotes without changing ordinary text', () => {
    expect(csvText([['Erkan; "Büro"']])).toBe('\uFEFF"Erkan; ""Büro"""');
  });
  const entry: DailyTimeEntry = { id: 'one', cleaner_id: 'worker', clock_in_at: '2026-10-22T06:00:00Z', clock_out_at: '2026-10-22T14:00:00Z', break_minutes: 30, break_started_at: null, needs_review: false, properties: { name: 'A' } };
  it('exports 8 hours minus 30 minutes once, with day session counts', () => {
    expect(attendanceExportDays('Worker', [{ date: '2026-10-22', status: 'worked', worked: true }], [entry], k => k, 0)[0].slice(3, 6)).toEqual(['1', '30', '450']);
  });
  it('keeps review entry visible with zero confirmed net minutes', () => {
    expect(attendanceExportDays('Worker', [{ date: '2026-10-22', status: 'worked', worked: true }], [{ ...entry, needs_review: true }], k => k, 0)[0].slice(3)).toEqual(['1', '30', '0', 'review', '0']);
  });
});