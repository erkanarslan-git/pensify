import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { listWuBookPilotProperties, createWuBookPilotProperty } from "@/lib/wubook.functions";
import { FIELDS, fieldError, validate, type FormKey } from "@/components/wubook-test-panel";

/** Splits "Straße 1, 32257 Bünde, DE" into address / zip / city. */
function splitAddress(a: string) {
  const parts = a.split(",").map((s) => s.trim());
  const m = (parts[1] ?? "").match(/^(\d{4,5})\s+(.+)$/);
  return { address: parts[0] ?? "", zip: m?.[1] ?? "", city: m?.[2] ?? "" };
}

export function WuBookPilotPanel() {
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();
  const list = useServerFn(listWuBookPilotProperties);
  const create = useServerFn(createWuBookPilotProperty);

  const { data: props = [] } = useQuery({
    queryKey: ["pilot-properties"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("id,name,address").eq("active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: linked = [] } = useQuery({ queryKey: ["wubook-pilots"], enabled: isAdmin, queryFn: () => list() });

  const [propertyId, setPropertyId] = useState("");
  const [form, setForm] = useState<Record<FormKey, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, ""])) as Record<FormKey, string>);
  const [touched, setTouched] = useState<Partial<Record<FormKey, boolean>>>({});
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  // Default to the pilot location (Borriesstraße) once properties load.
  useEffect(() => {
    if (propertyId || props.length === 0) return;
    const pilot = props.find((p) => /borrie/i.test(p.name)) ?? props[0];
    pick(pilot.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  function pick(id: string) {
    setPropertyId(id);
    const p = props.find((x) => x.id === id);
    if (!p) return;
    setForm((f) => ({ ...f, name: p.name.replace(/^Pension\s+/i, "Pension "), ...splitAddress(p.address ?? "") }));
    setTouched({});
    setReviewing(false);
    setConfirmed(false);
  }

  if (!isAdmin) return null;
  const propName = (id: string) => props.find((p) => p.id === id)?.name ?? "—";
  const alreadyLinked = linked.find((l) => l.propertyId === propertyId);
  const invalid = FIELDS.filter(([k]) => fieldError(k, form[k])).length;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4 mb-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">Echte Unterkunft bei WuBook anlegen (Pilot)</h3>
      </div>

      {linked.length > 0 && (
        <ul className="text-sm space-y-1">
          {linked.map((l) => (
            <li key={l.id} className="flex flex-wrap gap-x-3 items-center">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="font-medium">{propName(l.propertyId)}</span>
              <span className="text-muted-foreground">WuBook-Code {l.lcode} · Konto {l.acode ?? "—"} · Verkauf {l.enabled ? "aktiv" : "noch aus"}</span>
            </li>
          ))}
        </ul>
      )}

      {password && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm space-y-1">
          <p className="font-medium">WuBook-Passwort (wird nur jetzt angezeigt – bitte sicher notieren):</p>
          <code className="break-all">{password}</code>
          <Button size="sm" variant="ghost" onClick={() => setPassword(null)}>Ausblenden</Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Legt die gewählte Pension als eigene Unterkunft bei WuBook an. Es werden noch keine Zimmer, Preise oder Verfügbarkeiten gesendet und keine Kanäle verbunden.
      </p>

      <div className="space-y-1 max-w-md">
        <Label htmlFor="pilot-prop">Pension</Label>
        <select id="pilot-prop" value={propertyId} onChange={(e) => pick(e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm">
          {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {alreadyLinked ? (
        <p className="text-sm text-success">Diese Pension ist bereits mit WuBook verbunden (Code {alreadyLinked.lcode}).</p>
      ) : !reviewing ? (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {FIELDS.map(([k, label]) => {
              const err = touched[k] ? fieldError(k, form[k]) : null;
              const ok = touched[k] && !err;
              return (
                <div key={k} className="space-y-1">
                  <Label htmlFor={`pl-${k}`}>{label}</Label>
                  <Input id={`pl-${k}`} value={form[k]} maxLength={200} aria-invalid={!!err}
                    className={err ? "border-destructive" : ok ? "border-success" : ""}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    onBlur={() => setTouched((t) => ({ ...t, [k]: true }))} />
                  {err && <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" />{err}</p>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={() => {
              setTouched(Object.fromEntries(FIELDS.map(([k]) => [k, true])));
              if (!validate(form)) setReviewing(true);
            }}>Weiter zur Prüfung…</Button>
            {invalid > 0 && <span className="text-xs text-muted-foreground">{invalid} Feld(er) noch unvollständig oder fehlerhaft</span>}
          </div>
        </>
      ) : (
        <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="text-sm font-medium">Für „{propName(propertyId)}" werden diese Daten an WuBook gesendet:</p>
          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {FIELDS.map(([k, label]) => (
              <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{label}:</dt><dd className="break-all">{form[k]}</dd></div>
            ))}
          </dl>
          <p className="text-xs">Dies erstellt ein echtes WuBook-Konto für diese Pension. Das Passwort wird nur einmal angezeigt.</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} /> Ich bestätige das Anlegen bei WuBook.
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setReviewing(false); setConfirmed(false); }}>Zurück</Button>
            <Button size="sm" disabled={!confirmed || busy} onClick={async () => {
              setBusy(true);
              try {
                const r = await create({ data: { ...form, property_id: propertyId, confirm: true } });
                if (!r.ok) { toast.error(r.errorMessage); return; }
                setPassword(r.password ?? null);
                setReviewing(false);
                toast.success("Unterkunft bei WuBook angelegt");
              } catch (e) {
                toast.error(e instanceof Error ? e.message.slice(0, 160) : "Unbekannter Fehler");
              } finally {
                setBusy(false);
                qc.invalidateQueries({ queryKey: ["wubook-pilots"] });
              }
            }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Jetzt anlegen"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
