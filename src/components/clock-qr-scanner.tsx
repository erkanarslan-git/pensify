import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { clockTokenFromQr } from '@/lib/clock-qr';
import { supabase } from '@/integrations/supabase/client';

export function ClockQrScanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let resolving = false;
    let scanner: { start: () => Promise<void>; stop: () => void; destroy: () => void } | undefined;
    setError(null);
    setLoading(true);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('cameraUnavailable');
        const { default: QrScanner } = await import('qr-scanner');
        if (disposed || !video.current) return;
        scanner = new QrScanner(video.current, async result => {
          if (resolving || disposed) return;
          const token = clockTokenFromQr(result.data);
          if (!token) { setError('invalidQr'); return; }
          resolving = true;
          setLoading(true);
          const { data, error: failure } = await supabase.rpc('resolve_clock_property', { _token: token });
          if (disposed) return;
          if (failure || !data?.length) {
            setError(failure ? 'qrCheckFailed' : 'invalidQr');
            setLoading(false);
            resolving = false;
            return;
          }
          scanner?.stop();
          setOpen(false);
          await navigate({ to: '/clock/$token', params: { token } });
        }, { preferredCamera: 'environment', returnDetailedScanResult: true });
        await scanner.start();
        if (disposed) scanner.destroy();
        else setLoading(false);
      } catch (e) {
        if (!disposed) {
          const text = String(e);
          setError(/denied|notallowed|permission/i.test(text) ? 'cameraDenied' : 'cameraUnavailable');
          setLoading(false);
        }
      }
    }
    void start();
    return () => { disposed = true; scanner?.destroy(); };
  }, [open, attempt, navigate]);

  return <>
    <Button className="w-full min-h-16 text-lg" onClick={() => setOpen(true)}><Camera />{t('shift.scanButton')}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t('shift.scanButton')}</DialogTitle>
        <DialogDescription>{t('shift.cameraHint')}</DialogDescription>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          <video ref={video} muted playsInline className="h-full w-full object-cover" aria-label={t('shift.cameraPreview')} />
          {loading && <div role="status" className="absolute inset-0 grid place-items-center bg-background/60"><Loader2 className="animate-spin" aria-label={t('common.loading')} /></div>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{t(`shift.${error}`)}</p>}
        <div className="flex gap-2">
          {error && <Button variant="outline" onClick={() => setAttempt(n => n + 1)}>{t('shift.retry')}</Button>}
          <Button variant="outline" onClick={() => setOpen(false)}>{t('shift.closeCamera')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}