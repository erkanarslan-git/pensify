import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { dispatchMorningTasks, getTodayDispatch, simulateReply, saveDispatchSettings, runDemoScenario } from "@/lib/dispatch.functions";
import { Send, RefreshCw, Settings as Cog, Eye, MessageSquare, PlayCircle, Check, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";


export const Route = createFileRoute("/_authenticated/dispatch")({
  head: () => ({ meta: [{ title: "Görev Dağıtımı — Pensify" }] }),
  component: DispatchPage,
});

function DispatchPage() {
  const fetchToday = useServerFn(getTodayDispatch);
  const dispatchFn = useServerFn(dispatchMorningTasks);
  const replyFn = useServerFn(simulateReply);
  const saveSettings = useServerFn(saveDispatchSettings);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch", "today"],
    queryFn: () => fetchToday(),
  });

  const sendAll = useMutation({
    mutationFn: () => dispatchFn({ data: { trigger: "manual" } }),
    onSuccess: () => { toast.success("Mesajlar gönderildi"); qc.invalidateQueries({ queryKey: ["dispatch"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const sendOne = useMutation({
    mutationFn: (cleanerId: string) => dispatchFn({ data: { cleanerIds: [cleanerId], trigger: "resend" } }),
    onSuccess: () => { toast.success("Yeniden gönderildi"); qc.invalidateQueries({ queryKey: ["dispatch"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const reply = useMutation({
    mutationFn: (v: { cleanerId: string; text?: string; action?: "accept" | "start" | "complete" | "problem"; taskId?: string }) =>
      replyFn({ data: v }),
    onSuccess: (r: any) => {
      if (r.applied) toast.success(`${r.parsed}: görev → ${r.taskStatus}${r.roomStatus ? `, oda → ${r.roomStatus}` : ""}`);
      else toast.warning(`Uygulanmadı (${r.parsed}${r.error ? `: ${r.error}` : ""})`);
      qc.invalidateQueries({ queryKey: ["dispatch"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const demoFn = useServerFn(runDemoScenario);
  const runDemo = useMutation({
    mutationFn: (cleanerId?: string) => demoFn({ data: { cleanerId, reset: true } }),
    onSuccess: (r: any) => {
      if (!r.ok) { toast.error(`Demo: ${r.error}`); return; }
      const ok = r.steps.filter((s: any) => s.result.applied).length;
      toast.success(`Demo tamamlandı — ${ok}/${r.steps.length} adım uygulandı`);
      qc.invalidateQueries({ queryKey: ["dispatch"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState<{ cleanerId: string; name: string } | null>(null);


  if (isLoading) return <AppShell title="Görev Dağıtımı">Yükleniyor…</AppShell>;
  if (!data) return null;

  const s = data.settings as Record<string, any>;
  const morningTime = s["dispatch.morning_time"] || "08:00";
  const timezone = s["dispatch.timezone"] || "Europe/Istanbul";
  const enabled = s["dispatch.enabled"] === true;

  // group tasks per cleaner
  const tasksByCleaner = new Map<string, any[]>();
  for (const t of data.tasks) {
    if (!t.cleaner_id) continue;
    if (!tasksByCleaner.has(t.cleaner_id)) tasksByCleaner.set(t.cleaner_id, []);
    tasksByCleaner.get(t.cleaner_id)!.push(t);
  }
  const msgByCleaner = new Map<string, any>();
  for (const m of data.messages) {
    if (!msgByCleaner.has(m.cleaner_id)) msgByCleaner.set(m.cleaner_id, m);
  }

  const unassigned = data.tasks.filter((t: any) => !t.cleaner_id);

  return (
    <AppShell
      title="Görev Dağıtımı"
      subtitle={`Bugün ${data.scheduledFor} · ${enabled ? "Otomatik açık" : "Otomatik kapalı"} · ${morningTime} ${timezone}`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Cog className="w-4 h-4 mr-1" /> Ayarlar
          </Button>
          <Button variant="outline" size="sm" onClick={() => runDemo.mutate(undefined)} disabled={runDemo.isPending}>
            <PlayCircle className="w-4 h-4 mr-1" /> {runDemo.isPending ? "Çalışıyor…" : "Demo senaryosu"}
          </Button>
          <Button size="sm" onClick={() => sendAll.mutate()} disabled={sendAll.isPending}>
            <Send className="w-4 h-4 mr-1" /> Herkese şimdi gönder
          </Button>
        </>
      }

    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Kpi label="Aktif temizlikçi" value={data.cleaners.length} />
          <Kpi label="Bugünkü görev" value={data.tasks.length} />
          <Kpi label="Gönderilen mesaj" value={data.messages.length} />
        </div>

        <Section title="Temizlikçiler">
          <div className="grid md:grid-cols-2 gap-3">
            {data.cleaners.map((c: any) => {
              const tasks = tasksByCleaner.get(c.id) ?? [];
              const msg = msgByCleaner.get(c.id);
              const counts = { pending: 0, in_progress: 0, completed: 0 };
              for (const t of tasks) {
                // "accepted" tasks (cleaner acknowledged but not started) count as pending in the UI
                const key = t.status === "accepted" ? "pending" : t.status;
                (counts as any)[key] = ((counts as any)[key] ?? 0) + 1;
              }
              return (
                <div key={c.id} className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone ?? "telefon yok"}</div>
                    </div>
                    {msg ? <Badge tone="success">Gönderildi · {new Date(msg.sent_at).toLocaleTimeString()}</Badge> : <Badge tone="muted">Henüz gönderilmedi</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge tone="warning">{counts.pending} bekliyor</Badge>
                    <Badge tone="info">{counts.in_progress} sürüyor</Badge>
                    <Badge tone="success">{counts.completed} bitti</Badge>
                  </div>
                  {tasks.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {tasks.slice(0, 5).map((t: any, i: number) => (
                        <li key={t.id}>
                          {i + 1}. {t.properties?.name} - Oda {t.rooms?.number} · {t.status}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => sendOne.mutate(c.id)} disabled={sendOne.isPending || tasks.length === 0}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> {msg ? "Yeniden gönder" : "Şimdi gönder"}
                    </Button>
                    {msg && (
                      <Button size="sm" variant="ghost" onClick={() => setPreviewBody(msg.body)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> Mesajı gör
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setReplyOpen({ cleanerId: c.id, name: c.full_name })} disabled={!msg}>
                      <MessageSquare className="w-3.5 h-3.5 mr-1" /> Cevap simüle et
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {unassigned.length > 0 && (
          <Section title={`Atanmamış görevler (${unassigned.length})`}>
            <ul className="text-sm space-y-1">
              {unassigned.map((t: any) => (
                <li key={t.id} className="text-muted-foreground">
                  {t.properties?.name} - Oda {t.rooms?.number} · {t.status}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2">Bunlara temizlikçi atamak için Temizlik sayfasını kullanın.</p>
          </Section>
        )}
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initial={{ morningTime, timezone, enabled, template: s["dispatch.message_template"] || "" }}
        onSave={async (v) => {
          await saveSettings({ data: v });
          toast.success("Ayarlar kaydedildi");
          setSettingsOpen(false);
          qc.invalidateQueries({ queryKey: ["dispatch"] });
        }}
      />

      <Dialog open={previewBody != null} onOpenChange={(o) => !o && setPreviewBody(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>WhatsApp Mesajı Önizleme</DialogTitle></DialogHeader>
          <pre className="text-sm bg-muted rounded-lg p-4 whitespace-pre-wrap font-sans">{previewBody}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={replyOpen != null} onOpenChange={(o) => !o && setReplyOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{replyOpen?.name} adına cevap simüle et</DialogTitle></DialogHeader>
          <ReplyForm
            onSend={(text) => {
              if (replyOpen) reply.mutate({ cleanerId: replyOpen.cleanerId, text });
              setReplyOpen(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function ReplyForm({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("1 1");
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Örnek: <code>1 2</code> = 2. odayı başlat, <code>2 1</code> = 1. odayı bitir.
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full px-3 py-2 border border-input rounded-md text-sm"
        placeholder="1 1"
      />
      <div className="flex justify-end">
        <Button onClick={() => onSend(text)}>Gönder</Button>
      </div>
    </div>
  );
}

function SettingsDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: { morningTime: string; timezone: string; enabled: boolean; template: string };
  onSave: (v: { morningTime: string; timezone: string; enabled: boolean; template: string }) => void;
}) {
  const [morningTime, setMorningTime] = useState(initial.morningTime);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [template, setTemplate] = useState(initial.template);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Görev Dağıtımı Ayarları</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border">
            <span className="text-sm">Otomatik sabah bildirimi aktif</span>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Saat (24s)</span>
              <input type="time" value={morningTime} onChange={(e) => setMorningTime(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Zaman dilimi</span>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="px-3 py-2 border border-input rounded-md text-sm" />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Mesaj şablonu — kullanılabilir değişkenler: {"{ad}, {N}, {liste}"}</span>
            <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={10} className="px-3 py-2 border border-input rounded-md text-sm font-mono" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button onClick={() => onSave({ morningTime, timezone, enabled, template })}>Kaydet</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
