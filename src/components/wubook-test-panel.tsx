import { useState } from "react";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validate(f: Record<FormKey, string>): string | null {
  const t = (k: FormKey) => f[k].trim();
  if (t("name").length < 2) return "Name der Unterkunft: mindestens 2 Zeichen.";
  if (t("address").length < 2) return "Adresse: mindestens 2 Zeichen.";
  if (t("zip").length < 3) return "PLZ: mindestens 3 Zeichen.";
  if (t("city").length < 2) return "Stadt: mindestens 2 Zeichen.";
  for (const k of ["phone", "account_phone"] as const) {
    if (t(k).replace(/\D/g, "").length < 5) return `${k === "phone" ? "Telefon" : "Telefon (Konto)"}: bitte eine echte Telefonnummer (mind. 5 Ziffern) eingeben.`;
  }
  for (const k of ["contact_email", "booking_email", "email"] as const) {
    if (!EMAIL_RE.test(t(k))) return "Bitte gültige E-Mail-Adressen eingeben.";
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
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [readResult, setReadResult] = useState<{ lcode: string; pending: number } | null>(null);

  const { data: st } = useQuery({
    queryKey: ["wubook-webhook-status"],
    queryFn: () => fetchStatus(),
    enabled: isAdmin,
    refetchInterval: (q) => {
      const t = q.state.data?.testAccount?.webhookTest;
      return t && t["accepted"] && !t["received_at"] ? 4000 : false;
    },
  });
  if (!isAdmin) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["wubook-webhook-status"] });

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(`Aktion fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 160) : "unbekannter Fehler"}`); } finally { setBusy(null); refresh(); }
  }

  const acc = st?.testAccount;
  const wt = acc?.webhookTest ?? null;
  const pc = acc?.pushUrlCheck ?? null;

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
                {FIELDS.map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`wb-${k}`}>{label}</Label>
                    <Input id={`wb-${k}`} value={form[k]} maxLength={200} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Fest: Land DE · Zeitzone Europe/Berlin · Sprache de · Währung EUR</p>
              <Button size="sm" onClick={() => { const err = validate(form); if (err) { toast.error(err); return; } setReviewing(true); }} disabled={FIELDS.some(([k]) => !form[k].trim())}>Testunterkunft erstellen…</Button>
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
              <Step ok={wt ? (wt["accepted"] === true ? true : wt["accepted"] === false ? false : null) : null} label={wt?.["error"] ? `WuBook: ${String(wt["error"])}` : "WuBook hat den Aufruf angenommen"} />
              <Step ok={wt?.["received_at"] ? true : null} label={`Webhook hat Pensify erreicht ${wt?.["received_at"] ? fmt(wt["received_at"]) : ""}`} />
              <Step ok={wt?.["http_status"] === 200 ? true : null} label="HTTP 200 zurückgegeben (Test: lcode 1000 / rcode 2000)" />
            </ul>
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
