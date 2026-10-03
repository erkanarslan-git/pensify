import { useEffect, useState } from "react";

const TIMEOUT_MS = 30_000;
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Loader2, CheckCircle2, XCircle, Circle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/use-permissions";
import {
  getWuBookWebhookStatus,
  createWuBookTestProperty,
  startWuBookWebhookTest,
  checkWuBookPushUrl,
  fetchWuBookNewBookingsReadOnly,
} from "@/lib/wubook.functions";

const FIELDS = [
  ["name", "Name der Unterkunft"],
  ["address", "Adresse"],
  ["zip", "PLZ"],
  ["city", "Stadt"],
  ["phone", "Telefon"],
  ["contact_email", "Kontakt-E-Mail"],
  ["booking_email", "Buchungs-E-Mail"],
  ["first_name", "Vorname (Konto)"],
  ["last_name", "Nachname (Konto)"],
  ["email", "E-Mail (Konto)"],
  ["account_phone", "Telefon (Konto)"],
] as const;
type FormKey = (typeof FIELDS)[number][0];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN: Partial<Record<FormKey, number>> = { name: 2, address: 2, zip: 3, city: 2, first_name: 1, last_name: 1 };
function fieldError(k: FormKey, raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Pflichtfeld";
  if (k === "phone" || k === "account_phone") {
    if (!/^\+?[\d\s()/-]+$/.test(v)) return "Nur Ziffern, Leerzeichen und + erlaubt";
    if (v.replace(/\D/g, "").length < 5) return "Mindestens 5 Ziffern (z. B. +49 176 1234567)";
    return null;
  }
  if (k === "contact_email" || k === "booking_email" || k === "email") {
    if (!v.includes("@")) return "Es fehlt das @-Zeichen (z. B. name@gmail.com)";
    if (!EMAIL_RE.test(v)) return "Keine gültige E-Mail-Adresse (z. B. name@gmail.com)";
    return null;
  }
  if (k === "zip" && !/^\d{4,5}$/.test(v)) return "PLZ: 4–5 Ziffern";
  const m = MIN[k];
  if (m && v.length < m) return `Mindestens ${m} Zeichen`;
  return null;
}
function validate(f: Record<FormKey, string>): string | null {
  for (const [k, label] of FIELDS) {
    const e = fieldError(k, f[k]);
    if (e) return `${label}: ${e}`;
  }
  return null;
}

const fmt = (s?: unknown) => (typeof s === "string" ? new Date(s).toLocaleString("de-DE") : "—");

function Step({ ok, label }: { ok: boolean | null; label: string }) {
  const Icon = ok === null ? Circle : ok ? CheckCircle2 : XCircle;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon className={`h-4 w-4 ${ok ? "text-success" : ok === false ? "text-destructive" : "text-muted-foreground"}`} />
      {label}
    </li>
  );
}

export function WuBookTestPanel() {
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getWuBookWebhookStatus);
  const create = useServerFn(createWuBookTestProperty);
  const startTest = useServerFn(startWuBookWebhookTest);
  const checkUrl = useServerFn(checkWuBookPushUrl);
  const fetchNew = useServerFn(fetchWuBookNewBookingsReadOnly);

  const [form, setForm] = useState<Record<FormKey, string>>(() => {
    const f = Object.fromEntries(FIELDS.map(([k]) => [k, ""])) as Record<FormKey, string>;
    f.name = "Pensify API Test";
    return f;
  });
  const [reviewing, setReviewing] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<FormKey, boolean>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [readResult, setReadResult] = useState<{ lcode: string; pending: number } | null>(null);

  const { data: st } = useQuery({
    queryKey: ["wubook-webhook-status"],
    queryFn: () => fetchStatus(),
    enabled: isAdmin,
    refetchInterval: (q) => {
      const d = q.state.data;
      const t = d?.testAccount?.webhookTest;
      if (!t || t["accepted"] === false || typeof t["started_at"] !== "string") return false;
      const started = t["started_at"] as string;
      const got = t["received_at"] || d?.inbox?.some((i) => i.event_type === "test" && i.received_at >= started);
      const age = Date.now() - new Date(started).getTime();
      return !got && age < TIMEOUT_MS + 5000 ? 2000 : false;
    },
  });
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);
  if (!isAdmin) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["wubook-webhook-status"] });

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(`Aktion fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 160) : "unbekannter Fehler"}`); } finally { setBusy(null); refresh(); }
  }

  const acc = st?.testAccount;
  const wt = acc?.webhookTest ?? null;
  const pc = acc?.pushUrlCheck ?? null;
  const startedAt = typeof wt?.["started_at"] === "string" ? (wt["started_at"] as string) : null;
  const inboxHit = startedAt ? st?.inbox?.find((i) => i.event_type === "test" && i.received_at >= startedAt) : undefined;
  const receivedAt = (wt?.["received_at"] as string | undefined) ?? inboxHit?.received_at ?? null;
  const timedOut = startedAt ? Date.now() - new Date(startedAt).getTime() > TIMEOUT_MS : false;
  // Green once the ping arrived (even if acceptance was overwritten); red on rejection or timeout.
  const accepted: boolean | null = !wt ? null : receivedAt || wt["accepted"] === true ? true : wt["accepted"] === false ? false : timedOut ? false : null;
  const reached: boolean | null = !wt ? null : receivedAt ? true : accepted === false || timedOut ? false : null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">WuBook Testunterkunft & Webhook</h3>
      </div>

      {!acc?.lcode ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Legt bei WuBook eine separate Testunterkunft an (ohne Booking.com, Airbnb oder Expedia). Echte Zimmer und Buchungen bleiben unberührt.
          </p>
          {!reviewing ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {FIELDS.map(([k, label]) => {
                  const err = touched[k] ? fieldError(k, form[k]) : null;
                  const ok = touched[k] && !err;
                  return (
                    <div key={k} className="space-y-1">
                      <Label htmlFor={`wb-${k}`}>{label}</Label>
                      <Input
                        id={`wb-${k}`}
                        value={form[k]}
                        maxLength={200}
                        aria-invalid={!!err}
                        className={err ? "border-destructive focus-visible:ring-destructive" : ok ? "border-success" : ""}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, [k]: true }))}
                      />
                      {err ? (
                        <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" />{err}</p>
                      ) : ok ? (
                        <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />OK</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Fest: Land DE · Zeitzone Europe/Berlin · Sprache de · Währung EUR</p>
              {(() => {
                const invalid = FIELDS.filter(([k]) => fieldError(k, form[k])).length;
                return (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button size="sm" onClick={() => {
                      setTouched(Object.fromEntries(FIELDS.map(([k]) => [k, true])));
                      if (validate(form)) return;
                      setReviewing(true);
                    }}>Testunterkunft erstellen…</Button>
                    {invalid > 0 && <span className="text-xs text-muted-foreground">{invalid} Feld(er) noch unvollständig oder fehlerhaft</span>}
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-medium">Folgende Daten werden an WuBook gesendet:</p>
              <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {FIELDS.map(([k, label]) => (
                  <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{label}:</dt><dd className="break-all">{form[k]}</dd></div>
                ))}
              </dl>
              <p className="text-xs">Achtung: Dies erstellt ein echtes Konto bei WuBook. Kanäle werden nicht verbunden. Das Passwort wird nur einmal angezeigt.</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} /> Ich bestätige das Anlegen der Testunterkunft.
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setReviewing(false); setConfirmed(false); }}>Zurück</Button>
                <Button size="sm" disabled={!confirmed || busy !== null} onClick={() => act("create", async () => {
                  const r = await create({ data: { ...form, confirm: true } });
                  if (!r.ok) { toast.error(r.errorMessage); return; }
                  setPassword(r.password ?? null);
                  toast.success("Testunterkunft erstellt");
                })}>
                  {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Jetzt erstellen"}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {password && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-1">
              <p className="font-medium">WuBook-Passwort (wird nur jetzt angezeigt):</p>
              <code className="break-all">{password}</code>
              <Button size="sm" variant="ghost" onClick={() => setPassword(null)}>Ausblenden</Button>
            </div>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-muted-foreground">Property-Code</dt><dd>{acc.lcode}</dd></div>
            <div><dt className="text-muted-foreground">Konto-Code</dt><dd>{acc.acode ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Buchungsimport</dt><dd>{st?.importEnabled ? "Aktiv" : "Aus (nur empfangen)"}</dd></div>
            <div><dt className="text-muted-foreground">Erstellt</dt><dd>{fmt(acc.createdAt)}</dd></div>
          </dl>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-medium text-sm">Webhook-Test</h4>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("push", async () => {
                const r = await startTest();
                if (!r.ok) toast.error(r.errorMessage); else toast.success("Test gestartet");
              })}>{busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" /> : "WuBook Webhook testen"}</Button>
            </div>
            <ul className="space-y-1">
              <Step ok={wt ? true : null} label={`Test gestartet ${wt ? fmt(wt["started_at"]) : ""}`} />
              <Step ok={accepted} label={wt?.["error"] ? `WuBook: ${String(wt["error"])}` : "WuBook hat den Aufruf angenommen"} />
              <Step ok={reached} label={reached === false ? "Webhook hat Pensify nicht erreicht (keine Antwort innerhalb von 30 Sekunden)" : `Webhook hat Pensify erreicht ${receivedAt ? fmt(receivedAt) : ""}`} />
              <Step ok={reached} label="HTTP 200 zurückgegeben (Test: lcode 1000 / rcode 2000)" />
            </ul>
            {(accepted === false || reached === false) && (
              <p className="text-sm text-destructive">Test fehlgeschlagen. Bitte erneut testen; bleibt es rot, Webhook-Adresse prüfen.</p>
            )}
            {reached && <p className="text-sm text-success">Test erfolgreich – WuBook erreicht Pensify.</p>}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-medium text-sm">Webhook-Adresse</h4>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("url", async () => {
                const r = await checkUrl();
                if (!r.ok) toast.error(r.errorMessage);
              })}>{busy === "url" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Prüfen"}</Button>
            </div>
            <dl className="text-sm space-y-1">
              <div><dt className="text-muted-foreground inline">Erwartet: </dt><dd className="inline break-all">{st?.expectedUrl ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground inline">Bei WuBook: </dt><dd className="inline break-all">{(pc?.["registered"] as string) ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground inline">Status: </dt><dd className="inline">{pc ? (pc["matches"] ? "Stimmt überein" : "Stimmt nicht überein") : "Noch nicht geprüft"} · {fmt(pc?.["checked_at"])}</dd></div>
            </dl>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-medium text-sm">Buchungen lesen (nur lesen)</h4>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("read", async () => {
                const r = await fetchNew();
                if (!r.ok) { toast.error(r.errorMessage); return; }
                setReadResult({ lcode: r.lcode, pending: r.pending });
              })}>{busy === "read" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Testen"}</Button>
            </div>
            {readResult && (
              <p className="text-sm">API-Zugriff erfolgreich · Testunterkunft: {readResult.lcode} · Offene Buchungen: {readResult.pending} · Keine Daten geändert</p>
            )}
          </section>

          {st?.inbox && st.inbox.length > 0 && (
            <section className="space-y-1">
              <h4 className="font-medium text-sm">Letzte Benachrichtigungen</h4>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {st.inbox.map((i) => (
                  <li key={i.id}>{fmt(i.received_at)} · {i.event_type} · {i.lcode}/{i.rcode} · {i.status}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
