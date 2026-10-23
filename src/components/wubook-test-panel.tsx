import { useTranslation } from "react-i18next";
import { legacyText } from "@/i18n/legacy-text";
import { displayLocale } from "@/i18n/legacy-ui";
import i18n from "@/i18n";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
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

export const FIELDS = [
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
export type FormKey = (typeof FIELDS)[number][0];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN: Partial<Record<FormKey, number>> = { name: 2, address: 2, zip: 3, city: 2, first_name: 1, last_name: 1 };
export function fieldError(k: FormKey, raw: string): string | null {
  const v = raw.trim();
  if (!v) return legacyText('Pflichtfeld');
  if (k === "phone" || k === "account_phone") {
    if (!/^\+?[\d\s()/-]+$/.test(v)) return legacyText('Nur Ziffern, Leerzeichen und + erlaubt');
    if (v.replace(/\D/g, "").length < 5) return legacyText('Mindestens 5 Ziffern (z. B. +49 176 1234567)');
    return null;
  }
  if (k === "contact_email" || k === "booking_email" || k === "email") {
    if (!v.includes("@")) return legacyText('Es fehlt das @-Zeichen (z. B. name@gmail.com)');
    if (!EMAIL_RE.test(v)) return legacyText('Keine gültige E-Mail-Adresse (z. B. name@gmail.com)');
    return null;
  }
  if (k === "zip" && !/^\d{4,5}$/.test(v)) return legacyText('PLZ: 4–5 Ziffern');
  const m = MIN[k];
  if (m && v.length < m) return String(i18n.t("legacyUi.minChars", { count: m }));
  return null;
}
export function validate(f: Record<FormKey, string>): string | null {
  for (const [k, label] of FIELDS) {
    const e = fieldError(k, f[k]);
    if (e) return `${legacyText(label)}: ${e}`;
  }
  return null;
}

const fmt = (s?: unknown) => (typeof s === "string" ? new Date(s).toLocaleString(displayLocale(), { timeZone: BUSINESS_TIME_ZONE }) : "—");

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
  const { t } = useTranslation();
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
    try { await fn(); } catch (e) { toast.error(t("legacyUi.actionFailed", { error: e instanceof Error ? e.message.slice(0, 160) : legacyText("Unbekannter Fehler") })); } finally { setBusy(null); refresh(); }
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
        <h3 className="font-semibold">{legacyText('WuBook Testunterkunft & Webhook')}</h3>
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
                      <Label htmlFor={`wb-${k}`}>{legacyText(label)}</Label>
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
              <p className="text-xs text-muted-foreground">{legacyText('Fest: Land DE · Zeitzone Europe/Berlin · Sprache de · Währung EUR')}</p>
              {(() => {
                const invalid = FIELDS.filter(([k]) => fieldError(k, form[k])).length;
                return (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button size="sm" onClick={() => {
                      setTouched(Object.fromEntries(FIELDS.map(([k]) => [k, true])));
                      if (validate(form)) return;
                      setReviewing(true);
                    }}>{legacyText('Testunterkunft erstellen…')}</Button>
                    {invalid > 0 && <span className="text-xs text-muted-foreground">{t("legacyUi.invalidFields", { count: invalid })}</span>}
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-medium">{legacyText('Folgende Daten werden an WuBook gesendet:')}</p>
              <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {FIELDS.map(([k, label]) => (
                  <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{legacyText(label)}:</dt><dd className="break-all">{form[k]}</dd></div>
                ))}
              </dl>
              <p className="text-xs">{legacyText('Achtung: Dies erstellt ein echtes Konto bei WuBook. Kanäle werden nicht verbunden. Das Passwort wird nur einmal angezeigt.')}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} /> Ich bestätige das Anlegen der Testunterkunft.
              </label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setReviewing(false); setConfirmed(false); }}>{legacyText('Zurück')}</Button>
                <Button size="sm" disabled={!confirmed || busy !== null} onClick={() => act("create", async () => {
                  const r = await create({ data: { ...form, confirm: true } });
                  if (!r.ok) { toast.error(r.errorMessage); return; }
                  setPassword(r.password ?? null);
                  toast.success(legacyText('Testunterkunft erstellt'));
                })}>
                  {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : legacyText('Jetzt erstellen')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {password && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-1">
              <p className="font-medium">{legacyText('WuBook-Passwort (wird nur jetzt angezeigt):')}</p>
              <code className="break-all">{password}</code>
              <Button size="sm" variant="ghost" onClick={() => setPassword(null)}>{legacyText('Ausblenden')}</Button>
            </div>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-muted-foreground">{legacyText('Property-Code')}</dt><dd>{acc.lcode}</dd></div>
            <div><dt className="text-muted-foreground">{legacyText('Konto-Code')}</dt><dd>{acc.acode ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">{legacyText('Buchungsimport')}</dt><dd>{st?.importEnabled ? legacyText('Aktiv') : legacyText('Aus (nur empfangen)')}</dd></div>
            <div><dt className="text-muted-foreground">{legacyText('Erstellt')}</dt><dd>{fmt(acc.createdAt)}</dd></div>
          </dl>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{legacyText('Webhook-Test')}</h4>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("push", async () => {
                const r = await startTest();
                if (!r.ok) toast.error(r.errorMessage); else toast.success(legacyText('Test gestartet'));
              })}>{busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" /> : legacyText('WuBook Webhook testen')}</Button>
            </div>
            <ul className="space-y-1">
              <Step ok={wt ? true : null} label={`${legacyText("Test gestartet")} ${wt ? fmt(wt["started_at"]) : ""}`} />
              <Step ok={accepted} label={wt?.["error"] ? `WuBook: ${String(wt["error"])}` : legacyText('WuBook hat den Aufruf angenommen')} />
              <Step ok={reached} label={reached === false ? legacyText('Webhook hat Pensify nicht erreicht (keine Antwort innerhalb von 30 Sekunden)') : t("legacyUi.reached", { time: receivedAt ? fmt(receivedAt) : "" })} />
              <Step ok={reached} label=legacyText('HTTP 200 zurückgegeben (Test: lcode 1000 / rcode 2000)') />
            </ul>
            {(accepted === false || reached === false) && (
              <p className="text-sm text-destructive">{legacyText('Test fehlgeschlagen. Bitte erneut testen; bleibt es rot, Webhook-Adresse prüfen.')}</p>
            )}
            {reached && <p className="text-sm text-success">{legacyText('Test erfolgreich – WuBook erreicht Pensify.')}</p>}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{legacyText('Webhook-Adresse')}</h4>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("url", async () => {
                const r = await checkUrl();
                if (!r.ok) toast.error(r.errorMessage);
              })}>{busy === "url" ? <Loader2 className="h-4 w-4 animate-spin" /> : legacyText('Prüfen')}</Button>
            </div>
            <dl className="text-sm space-y-1">
              <div><dt className="text-muted-foreground inline">Erwartet: </dt><dd className="inline break-all">{st?.expectedUrl ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground inline">Bei WuBook: </dt><dd className="inline break-all">{(pc?.["registered"] as string) ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground inline">Status: </dt><dd className="inline">{pc ? (pc["matches"] ? legacyText('Stimmt überein') : legacyText('Stimmt nicht überein')) : legacyText('Noch nicht geprüft')} · {fmt(pc?.["checked_at"])}</dd></div>
            </dl>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{legacyText('Buchungen lesen (nur lesen)')}</h4>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act("read", async () => {
                const r = await fetchNew();
                if (!r.ok) { toast.error(r.errorMessage); return; }
                setReadResult({ lcode: r.lcode, pending: r.pending });
              })}>{busy === "read" ? <Loader2 className="h-4 w-4 animate-spin" /> : legacyText('Testen')}</Button>
            </div>
            {readResult && (
              <p className="text-sm">{t("legacyUi.readSuccess", { code: readResult.lcode, count: readResult.pending })}</p>
            )}
          </section>

          {st?.inbox && st.inbox.length > 0 && (
            <section className="space-y-1">
              <h4 className="font-medium text-sm">{legacyText('Letzte Benachrichtigungen')}</h4>
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
