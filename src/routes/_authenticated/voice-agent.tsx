import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { businessDate } from "@/lib/business-time";
import { voiceStats, type VoiceOutcome } from "@/lib/voice-agent";

export const Route = createFileRoute("/_authenticated/voice-agent")({
  head: () => ({ meta: [{ title: "Sesli Asistan — Pension Highway" }, { name: "description", content: "Mesai dışı telefon asistanı: çağrı kayıtları, nöbetçi personel ve performans." }, { property: "og:title", content: "Sesli Asistan — Pension Highway" }, { property: "og:description", content: "Mesai dışı çağrıları takip edin, nöbetçi personeli planlayın." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: VoiceAgentPage,
});

const TXT = {
  tr: { title: "Sesli Asistan", sub: "Mesai dışı telefonlar: çağrılar, nöbetçi ve başarı", calls: "Çağrılar", resolved: "Asistan çözdü", res: "Yeni rezervasyon", transferred: "Nöbetçiye aktarıldı", unresolved: "Çözülemedi", rate: "Başarı oranı", avg: "Ort. süre", last30: "Son 30 gün", history: "Çağrı geçmişi", empty: "Henüz çağrı yok. Asistan bağlandığında her konuşma burada görünür.", onCall: "Nöbetçi personel", onCallHint: "Asistan zorda kalınca o günün nöbetçisine aktarır.", name: "Ad", phone: "Telefon", save: "Kaydet", settings: "Asistan ayarları", enabled: "Asistan açık", agentId: "ElevenLabs asistan kimliği", from: "Başlangıç", to: "Bitiş", fallback: "Nöbetçi yoksa aranacak numara", webhook: "ElevenLabs'a girilecek çağrı sonu adresi", copied: "Kopyalandı", saved: "Kaydedildi", failed: "Kaydedilemedi", transcript: "Konuşma", caller: "Arayan", summary: "Özet", noAccess: "Bu bölümü yalnız firma sahibi ve yöneticiler görebilir.", outcomes: { info: "Bilgi verildi", reservation: "Rezervasyon", access_code: "Giriş bilgisi", transferred: "Aktarıldı", unresolved: "Çözülemedi", failed: "Hata" } },
  de: { title: "Sprachassistent", sub: "Anrufe außerhalb der Bürozeiten: Gespräche, Bereitschaft und Erfolg", calls: "Anrufe", resolved: "Vom Assistenten gelöst", res: "Neue Buchungen", transferred: "An Bereitschaft weitergeleitet", unresolved: "Nicht gelöst", rate: "Erfolgsquote", avg: "Ø Dauer", last30: "Letzte 30 Tage", history: "Anrufverlauf", empty: "Noch keine Anrufe. Sobald der Assistent verbunden ist, erscheint hier jedes Gespräch.", onCall: "Rufbereitschaft", onCallHint: "Der Assistent leitet schwierige Anrufe an die Bereitschaft des Tages weiter.", name: "Name", phone: "Telefon", save: "Speichern", settings: "Assistent-Einstellungen", enabled: "Assistent aktiv", agentId: "ElevenLabs Agent-ID", from: "Von", to: "Bis", fallback: "Nummer ohne Bereitschaft", webhook: "Post-Call-Adresse für ElevenLabs", copied: "Kopiert", saved: "Gespeichert", failed: "Speichern fehlgeschlagen", transcript: "Gespräch", caller: "Anrufer", summary: "Zusammenfassung", noAccess: "Nur Inhaber und Admins sehen diesen Bereich.", outcomes: { info: "Auskunft", reservation: "Buchung", access_code: "Zugangsinfo", transferred: "Weitergeleitet", unresolved: "Nicht gelöst", failed: "Fehler" } },
  en: { title: "Voice agent", sub: "After-hours phone calls: conversations, on-call staff and success", calls: "Calls", resolved: "Resolved by agent", res: "New bookings", transferred: "Transferred to on-call", unresolved: "Unresolved", rate: "Success rate", avg: "Avg. duration", last30: "Last 30 days", history: "Call history", empty: "No calls yet. Once the agent is connected, every conversation appears here.", onCall: "On-call staff", onCallHint: "The agent transfers difficult calls to the day's on-call person.", name: "Name", phone: "Phone", save: "Save", settings: "Agent settings", enabled: "Agent active", agentId: "ElevenLabs agent ID", from: "From", to: "To", fallback: "Number when nobody is on call", webhook: "Post-call address for ElevenLabs", copied: "Copied", saved: "Saved", failed: "Could not save", transcript: "Conversation", caller: "Caller", summary: "Summary", noAccess: "Only owners and admins can see this section.", outcomes: { info: "Information", reservation: "Booking", access_code: "Access info", transferred: "Transferred", unresolved: "Unresolved", failed: "Error" } },
};
const TONE: Record<VoiceOutcome, "success" | "info" | "warning" | "destructive" | "muted" | "primary"> = { info: "info", reservation: "success", access_code: "primary", transferred: "warning", unresolved: "destructive", failed: "destructive" };

type Call = { id: string; caller_phone: string | null; started_at: string; duration_seconds: number; language: string | null; outcome: VoiceOutcome; successful: boolean | null; summary: string | null; transcript: { role: string; text: string }[]; transferred_to: string | null };

function addDays(iso: string, n: number) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function VoiceAgentPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith("tr") ? "tr" : i18n.language.startsWith("en") ? "en" : "de";
  const c = TXT[lang];
  const locale = lang === "tr" ? "tr-TR" : lang === "en" ? "en-GB" : "de-DE";
  const perms = usePermissions();
  const allowed = perms.isOwner || perms.isAdmin;
  const qc = useQueryClient();
  const today = businessDate();
  const [open, setOpen] = useState<Call | null>(null);

  const org = useQuery({ queryKey: ["active-org"], queryFn: async () => (await supabase.rpc("active_organization_id")).data as string | null, enabled: allowed });
  const orgId = org.data ?? null;
  const calls = useQuery({
    queryKey: ["voice-calls", orgId], enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await supabase.from("voice_calls").select("id,caller_phone,started_at,duration_seconds,language,outcome,successful,summary,transcript,transferred_to").eq("organization_id", orgId!).gte("started_at", since).order("started_at", { ascending: false }).limit(500);
      if (error) throw error; return (data ?? []) as unknown as Call[];
    },
  });
  const duty = useQuery({
    queryKey: ["voice-on-call", orgId, today], enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("voice_on_call").select("id,duty_date,staff_name,phone").eq("organization_id", orgId!).gte("duty_date", today).lte("duty_date", addDays(today, 13));
      if (error) throw error; return data ?? [];
    },
  });
  const stats = useMemo(() => voiceStats(calls.data ?? []), [calls.data]);

  if (!allowed) return <AppShell title={c.title}><p className="text-sm text-muted-foreground">{c.noAccess}</p></AppShell>;

  const cards: [string, string | number][] = [[c.calls, stats.total], [c.resolved, stats.resolved], [c.res, stats.reservations], [c.transferred, stats.transferred], [c.unresolved, stats.unresolved], [c.rate, lang === "tr" ? `%${stats.resolutionRate}` : `${stats.resolutionRate}%`], [c.avg, fmtDur(stats.avgSeconds)]];

  return (
    <AppShell title={c.title} subtitle={c.sub}>
      <p className="mb-2 text-xs text-muted-foreground">{c.last30}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="truncate text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title={c.history}>
          {(calls.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted-foreground">{c.empty}</p> : (
            <ul className="divide-y divide-border">
              {calls.data!.map((call) => (
                <li key={call.id}>
                  <button type="button" onClick={() => setOpen(call)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-muted/50">
                    <span className="w-32 text-sm">{new Date(call.started_at).toLocaleString(locale, { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{call.caller_phone ?? "—"}<span className="ml-2 text-muted-foreground">{call.summary ?? ""}</span></span>
                    <span className="text-xs uppercase text-muted-foreground">{call.language ?? ""}</span>
                    <span className="text-xs text-muted-foreground">{fmtDur(call.duration_seconds)}</span>
                    <Badge tone={TONE[call.outcome]}>{c.outcomes[call.outcome]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <div className="space-y-6">
          <OnCall c={c} orgId={orgId} today={today} rows={duty.data ?? []} locale={locale} onSaved={() => qc.invalidateQueries({ queryKey: ["voice-on-call"] })} />
          <Settings c={c} orgId={orgId} />
        </div>
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{c.transcript}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              <div className="text-muted-foreground">{c.caller}: {open.caller_phone ?? "—"} · {fmtDur(open.duration_seconds)} {open.transferred_to ? `· → ${open.transferred_to}` : ""}</div>
              {open.summary && <div><span className="font-medium">{c.summary}: </span>{open.summary}</div>}
              <div className="space-y-2">
                {open.transcript.map((t, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 ${t.role === "agent" ? "bg-primary/10" : "bg-muted"}`}>{t.text}</div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

type Dict = (typeof TXT)["tr"];

function OnCall({ c, orgId, today, rows, locale, onSaved }: { c: Dict; orgId: string | null; today: string; rows: { id: string; duty_date: string; staff_name: string; phone: string }[]; locale: string; onSaved: () => void }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const [draft, setDraft] = useState<Record<string, { name: string; phone: string }>>({});
  useEffect(() => { setDraft(Object.fromEntries(rows.map((r) => [r.duty_date, { name: r.staff_name, phone: r.phone }]))); }, [rows]);
  const save = async (day: string) => {
    const v = draft[day]; if (!orgId || !v?.name.trim() || !v.phone.trim()) return;
    const { error } = await supabase.from("voice_on_call").upsert({ organization_id: orgId, duty_date: day, staff_name: v.name.trim(), phone: v.phone.trim() }, { onConflict: "organization_id,duty_date" });
    if (error) toast.error(c.failed); else { toast.success(c.saved); onSaved(); }
  };
  const remove = async (day: string) => {
    const row = rows.find((r) => r.duty_date === day); if (!row) return;
    const { error } = await supabase.from("voice_on_call").delete().eq("id", row.id);
    if (error) toast.error(c.failed); else onSaved();
  };
  return (
    <Section title={c.onCall}>
      <p className="px-5 pt-3 text-xs text-muted-foreground">{c.onCallHint}</p>
      <div className="space-y-3 p-5">
        {days.map((day) => {
          const v = draft[day] ?? { name: "", phone: "" };
          const set = (k: "name" | "phone", val: string) => setDraft((d) => ({ ...d, [day]: { ...v, [k]: val } }));
          return (
            <div key={day} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-2">
              <span className="col-span-4 text-xs font-medium text-muted-foreground">{new Date(day + "T12:00:00Z").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
              <Input aria-label={c.name} placeholder={c.name} value={v.name} onChange={(e) => set("name", e.target.value)} className="h-8" />
              <Input aria-label={c.phone} placeholder="+49…" value={v.phone} onChange={(e) => set("phone", e.target.value)} className="h-8" />
              <Button size="sm" variant="outline" onClick={() => save(day)}>{c.save}</Button>
              <Button size="icon" variant="ghost" aria-label="delete" disabled={!rows.some((r) => r.duty_date === day)} onClick={() => remove(day)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Settings({ c, orgId }: { c: Dict; orgId: string | null }) {
  const [f, setF] = useState({ enabled: false, agent_id: "", service_from: "19:00", service_to: "08:00", fallback_phone: "" });
  const webhook = "https://pensify.lovable.app/api/public/webhooks/elevenlabs";
  useEffect(() => { if (!orgId) return; void supabase.from("voice_agent_settings").select("*").eq("organization_id", orgId).maybeSingle().then(({ data }) => {
    if (data) setF({ enabled: data.enabled, agent_id: data.agent_id ?? "", service_from: String(data.service_from).slice(0, 5), service_to: String(data.service_to).slice(0, 5), fallback_phone: data.fallback_phone ?? "" });
  }); }, [orgId]);
  const save = async () => {
    if (!orgId) return;
    const { error } = await supabase.from("voice_agent_settings").upsert({ organization_id: orgId, enabled: f.enabled, agent_id: f.agent_id.trim() || null, service_from: f.service_from, service_to: f.service_to, fallback_phone: f.fallback_phone.trim() || null, updated_at: new Date().toISOString() });
    if (error) toast.error(c.failed); else toast.success(c.saved);
  };
  return (
    <Section title={c.settings}>
      <div className="space-y-3 p-5">
        <label className="flex items-center justify-between text-sm">{c.enabled}<Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>{c.from}</Label><Input type="time" value={f.service_from} onChange={(e) => setF({ ...f, service_from: e.target.value })} /></div>
          <div><Label>{c.to}</Label><Input type="time" value={f.service_to} onChange={(e) => setF({ ...f, service_to: e.target.value })} /></div>
        </div>
        <div><Label>{c.agentId}</Label><Input value={f.agent_id} onChange={(e) => setF({ ...f, agent_id: e.target.value })} placeholder="agent_…" /></div>
        <div><Label>{c.fallback}</Label><Input value={f.fallback_phone} onChange={(e) => setF({ ...f, fallback_phone: e.target.value })} placeholder="+49…" /></div>
        <div><Label>{c.webhook}</Label>
          <div className="flex gap-2"><Input readOnly value={webhook} className="text-xs" /><Button size="icon" variant="outline" aria-label="copy" onClick={() => { void navigator.clipboard.writeText(webhook); toast.success(c.copied); }}><Copy className="h-4 w-4" /></Button></div>
        </div>
        <Button onClick={save} className="w-full">{c.save}</Button>
      </div>
    </Section>
  );
}
