import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { businessTime, businessDate } from '@/lib/business-time';
import { toast } from 'sonner';

type Controls = { warning_after_minutes: number; review_after_minutes: number; last_run: { status: string; started_at: string } | null };
export function AttendanceReviewControls() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [warning, setWarning] = useState<number | null>(null);
  const [review, setReview] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['attendance-review-controls'], queryFn: async () => {
    const { data, error } = await supabase.rpc('attendance_review_controls');
    if (error) throw error;
    return data as unknown as Controls;
  }});
  const warningHours = warning ?? (q.data?.warning_after_minutes ?? 720) / 60;
  const reviewHours = review ?? (q.data?.review_after_minutes ?? 960) / 60;
  const save = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc('save_attendance_review_controls', { _warning: Math.round(warningHours * 60), _review: Math.round(reviewHours * 60) });
    if (error) throw error;
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['attendance-review-controls'] }); toast.success(t('attendance.saved')); }, onError: () => toast.error(t('attendance.failed')) });
  if (q.isError) return <p role="alert" className="text-sm text-destructive">{t('attendance.loadFailed')}</p>;
  return <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold">{t('attendance.reviewSettings')}</summary>
    <div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">{t('attendance.operationalOnly')}</p><div className="flex flex-wrap items-end gap-3">
      <Label className="grid gap-1">{t('attendance.warningHours')}<Input type="number" min={1} max={168} step={0.5} value={warningHours} onChange={e => setWarning(Number(e.target.value))} /></Label>
      <Label className="grid gap-1">{t('attendance.reviewHours')}<Input type="number" min={warningHours} max={168} step={0.5} value={reviewHours} onChange={e => setReview(Number(e.target.value))} /></Label>
      <Button disabled={!q.data || save.isPending || warningHours < 1 || reviewHours < warningHours || reviewHours > 168} onClick={() => save.mutate()}>{t('common.save')}</Button>
    </div><p className="text-xs text-muted-foreground">{t('attendance.lastReview')}: {q.data?.last_run ? `${businessDate(new Date(q.data.last_run.started_at))} ${businessTime(new Date(q.data.last_run.started_at))} · ${t(q.data.last_run.status === 'success' ? 'attendance.runSuccess' : 'attendance.runError')}` : t('attendance.notRun')}</p></div>
  </details>;
}