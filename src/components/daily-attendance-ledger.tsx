import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AttendanceBreak } from '@/lib/attendance-export';
import { type AttendanceDay } from '@/lib/attendance';
import { dailyTime, type DailyTimeEntry } from '@/lib/daily-time';
import { businessTime } from '@/lib/business-time';

const labels = {
  tr: { daily: 'Günlük mesai', sessions: 'Oturum', pause: 'Mola', net: 'Net süre', detail: 'Gün detayı', noBreaks: 'Ayrı mola kaydı yok', breaks: 'Mola aralıkları' },
  de: { daily: 'Tagesübersicht', sessions: 'Schichten', pause: 'Pause', net: 'Nettozeit', detail: 'Tagesdetails', noBreaks: 'Keine einzelnen Pausen erfasst', breaks: 'Pausenzeiten' },
  en: { daily: 'Daily work time', sessions: 'Sessions', pause: 'Break', net: 'Net time', detail: 'Day details', noBreaks: 'No separate breaks recorded', breaks: 'Break intervals' },
};
const tones: Record<string, string> = { worked: 'bg-success/10', sick: 'bg-warning/10', missing: 'bg-destructive/10', unexcused: 'bg-destructive/10', leave: 'bg-info/10', excused: 'bg-info/10' };
const duration = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export function DailyAttendanceLedger({ days, entries, breaks }: { days: AttendanceDay[]; entries: DailyTimeEntry[]; breaks: AttendanceBreak[] }) {
  const { t, i18n } = useTranslation();
  const L = labels[i18n.language.slice(0, 2) as keyof typeof labels] ?? labels.de;
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = Date.now();
  return <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="pb-2 text-left font-semibold">{L.daily}</caption>
    <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">{t('attendance.date')}</th><th className="p-2">{t('attendance.status')}</th><th className="p-2">{L.sessions}</th><th className="p-2">{L.pause}</th><th className="p-2">{L.net}</th><th className="p-2"><span className="sr-only">{L.detail}</span></th></tr></thead>
    <tbody>{days.map(day => {
      const summary = dailyTime(entries, day.date, now, breaks);
      const opened = day.date === expanded;
      return <Fragment key={day.date}><tr className={`border-b border-border ${tones[day.status] ?? 'bg-muted/30'}`}>
        <td className="p-2 whitespace-nowrap">{day.date.split('-').reverse().join('.')}</td>
        <td className="p-2">{t(`attendance.${day.status}`)}{summary.needsReview && <div className="text-destructive text-xs">{t('clock.needsReview')}</div>}{summary.active && <div className="text-xs">{t('timeTracking.active')}</div>}{day.absence && day.worked && <div className="text-xs">{t('attendance.conflict')}</div>}</td>
        <td className="p-2 tabular-nums">{summary.sessions.length}</td><td className="p-2 tabular-nums">{duration(summary.breakMinutes)}</td><td className="p-2 tabular-nums font-medium">{duration(summary.netMinutes)}{summary.ongoingMinutes > 0 && <div className="text-xs text-muted-foreground">{t('attendance.ongoingMinutes')}: {duration(summary.ongoingMinutes)}</div>}</td>
        <td className="p-2"><Button variant="ghost" size="icon" disabled={!summary.sessions.length} aria-label={`${L.detail} ${day.date}`} aria-expanded={opened} onClick={() => setExpanded(opened ? null : day.date)}>{opened ? <ChevronDown /> : <ChevronRight />}</Button></td>
      </tr>{opened && <tr><td colSpan={6} className="p-3 bg-muted/20"><div className="space-y-3">{summary.sessions.map(e => <div key={e.id} className="border-b border-border pb-2"><div className="flex flex-wrap gap-2 font-medium"><span>{e.properties?.name ?? '—'}</span><span>{businessTime(new Date(e.clock_in_at))} — {e.clock_out_at ? businessTime(new Date(e.clock_out_at)) : e.needs_review ? t('clock.needsReview') : t('timeTracking.active')}</span></div><div className="text-xs text-muted-foreground">{L.pause}: {dailyTime([e], day.date, now, breaks).breakMinutes} min · {e.needs_review ? t('clock.needsReview') : `${L.net}: ${duration(dailyTime([e], day.date, now, breaks).netMinutes)}`}</div>
        <div className="mt-1 text-xs">{L.breaks}: {breaks.filter(b => b.time_entry_id === e.id).length ? breaks.filter(b => b.time_entry_id === e.id).map(b => <span key={b.id} className="mr-3">{businessTime(new Date(b.started_at))} — {b.ended_at ? businessTime(new Date(b.ended_at)) : t('shift.state.on_break')}</span>) : L.noBreaks}</div>
      </div>)}</div></td></tr>}</Fragment>;
    })}</tbody>
  </table></div>;
}