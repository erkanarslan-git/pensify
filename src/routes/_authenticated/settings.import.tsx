import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { friendlyError } from "@/components/property-rooms-view";
import {
  parsePhysicalRooms, parseListings, groupByAddress, matchProperty, suggestNumbers,
  type AddressGroup, type ParsedRoom,
} from "@/lib/import/wp-rooms";

export const Route = createFileRoute("/_authenticated/settings/import")({
  head: () => ({
    meta: [
      { title: "Datenimport — Pensify" },
      { name: "description", content: "Pensionen, Zimmertypen und Zimmer aus WordPress-Exporten prüfen und importieren." },
    ],
  }),
  component: ImportPage,
});

const REPORTED_TOTAL = 105;
type Decision = { mode: "existing"; id: string } | { mode: "new"; name: string } | { mode: "merge"; into: string };
type RoomAction = "create" | "link" | "skip";
interface ExistingProp { id: string; name: string }
interface ExistingRoom { id: string; property_id: string; number: string; external_source_id: string | null }
interface ExistingType { property_id: string; code: string }
interface ImportResult {
  properties_created: number; room_types_created: number; rooms_created: number;
  rooms_updated: number; rooms_skipped: number; needs_review: number;
}

const sel = "px-2 py-1 rounded-md border border-input bg-card text-xs";
const inp = "px-2 py-1 rounded-md border border-input bg-card text-xs w-full";

function ImportPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const [step, setStep] = useState(1);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [rooms, setRooms] = useState<ParsedRoom[]>([]);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [props, setProps] = useState<ExistingProp[]>([]);
  const [exRooms, setExRooms] = useState<ExistingRoom[]>([]);
  const [exTypes, setExTypes] = useState<ExistingType[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [capacity, setCapacity] = useState<Record<string, number>>({});
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [guessed, setGuessed] = useState<Record<string, boolean>>({});
  const [actions, setActions] = useState<Record<string, RoomAction>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loadError, setLoadError] = useState(false);

  const groups = useMemo(() => groupByAddress(rooms), [rooms]);

  useEffect(() => {
    if (!perms.isAdmin) return;
    (async () => {
      const [p, r, ty] = await Promise.all([
        supabase.from("properties").select("id,name").order("name"),
        supabase.from("rooms").select("id,property_id,number,external_source_id"),
        supabase.from("room_types").select("property_id,code"),
      ]);
      const err = [p, r, ty].find((x) => x.error);
      if (err?.error) { console.error("[import] load", err.error); setLoadError(true); return; }
      setProps((p.data ?? []) as ExistingProp[]);
      setExRooms((r.data ?? []) as ExistingRoom[]);
      setExTypes(((ty.data ?? []) as ExistingType[]));
    })();
  }, [perms.isAdmin, result]);

  if (perms.loading) return <div className="text-sm text-muted-foreground">{t("import.loading")}</div>;
  if (!perms.isAdmin) return <div className="rounded-xl border border-border bg-card p-4 text-sm">{t("import.noPermission")}</div>;

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    let physical: ParsedRoom[] = [];
    let listings: number | null = null;
    const names: string[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 20 * 1024 * 1024) { toast.error(t("import.fileTooLarge")); return; }
      const text = await f.text();
      names.push(f.name);
      const firstLine = text.slice(0, 2000);
      // Listing export has the "Amenities"/"Standort" columns; physical rooms export does not.
      if (/Standort/.test(firstLine.split("\n")[0])) listings = parseListings(text).length;
      else physical = parsePhysicalRooms(text);
    }
    if (!physical.length) { toast.error(t("import.noRoomsFile")); return; }
    setFileNames(names);
    setRooms(physical);
    setListingCount(listings);
    const g = groupByAddress(physical);
    const d: Record<string, Decision> = {};
    const nums: Record<string, string> = {}; const gs: Record<string, boolean> = {}; const acts: Record<string, RoomAction> = {};
    for (const grp of g) {
      const m = matchProperty(grp, props);
      d[grp.key] = m ? { mode: "existing", id: m.id } : { mode: "new", name: `Pension ${grp.city} — ${grp.street}` };
      for (const [id, s] of suggestNumbers(grp.rooms)) { nums[id] = s.number; gs[id] = s.guessed; }
      for (const r of grp.rooms) acts[r.externalId] = "create";
    }
    const caps: Record<string, number> = {};
    for (const r of physical) if (r.type?.capacity) caps[r.type.code] = r.type.capacity;
    setDecisions(d); setNumbers(nums); setGuessed(gs); setActions(acts); setCapacity(caps); setLinks({});
    setResult(null);
    setStep(2);
  };

  // Effective target key for a group (merges are resolved one level deep).
  const effKey = (k: string): string => {
    const d = decisions[k];
    return d?.mode === "merge" && decisions[d.into]?.mode !== "merge" ? d.into : k;
  };
  const targetPropId = (k: string): string | null => {
    const d = decisions[effKey(k)];
    return d?.mode === "existing" ? d.id : null;
  };

  const typeCodes = [...new Set(rooms.map((r) => r.type?.code).filter(Boolean) as string[])];
  const missingCapacity = typeCodes.filter((c) => !(capacity[c] >= 1 && capacity[c] <= 20));

  const roomIssues = (r: ParsedRoom, g: AddressGroup): string[] => {
    const issues: string[] = [];
    const act = actions[r.externalId];
    if (act === "skip") return issues;
    if (!r.type) issues.push(t("import.issue.type"));
    const pid = targetPropId(g.key);
    const already = exRooms.find((x) => x.external_source_id === r.externalId);
    const num = (numbers[r.externalId] ?? "").trim();
    if (!num) issues.push(t("import.issue.number"));
    if (act === "link" && !links[r.externalId] && !already) issues.push(t("import.issue.link"));
    if (act === "create" && !already && pid && exRooms.some((x) => x.property_id === pid && x.number === num))
      issues.push(t("import.issue.taken", { n: num }));
    const dup = rooms.filter((o) => effKey(o.addressKey) === effKey(g.key) && actions[o.externalId] !== "skip"
      && (numbers[o.externalId] ?? "").trim() === num).length;
    if (num && dup > 1) issues.push(t("import.issue.dup", { n: num }));
    return issues;
  };
  const allIssues = groups.flatMap((g) => g.rooms.flatMap((r) => roomIssues(r, g)));
  const badDecision = groups.some((g) => {
    const d = decisions[g.key];
    return !d || (d.mode === "new" && !d.name.trim()) || (d.mode === "merge" && (d.into === g.key || decisions[d.into]?.mode === "merge"));
  });

  const counts = (() => {
    const active = rooms.filter((r) => actions[r.externalId] !== "skip");
    const reimport = active.filter((r) => exRooms.some((x) => x.external_source_id === r.externalId)).length;
    const linked = active.filter((r) => actions[r.externalId] === "link").length;
    const newProps = groups.filter((g) => decisions[g.key]?.mode === "new").length;
    const typeKeys = new Set(active.map((r) => `${effKey(r.addressKey)}|${r.type?.code}`));
    const newTypes = [...typeKeys].filter((k) => {
      const [gk, code] = k.split("|"); const pid = targetPropId(gk);
      return !pid || !exTypes.some((x) => x.property_id === pid && x.code === code);
    }).length;
    return { newProps, newTypes, create: active.length - reimport - linked, update: reimport + linked, skip: rooms.length - active.length };
  })();

  const runImport = async () => {
    if (!confirm(t("import.confirm"))) return;
    const effKeys = [...new Set(groups.map((g) => effKey(g.key)))];
    const batch = {
      file_names: fileNames,
      properties: effKeys.map((k) => {
        const g = groups.find((x) => x.key === k)!; const d = decisions[k];
        return d.mode === "existing" ? { key: k, existing_id: d.id }
          : { key: k, name: d.mode === "new" ? d.name.trim() : "", city: g.city, address: g.street };
      }),
      room_types: [] as { key: string; property_key: string; name: string; code: string; capacity: number }[],
      rooms: [] as Record<string, unknown>[],
    };
    const seen = new Set<string>();
    for (const r of rooms) {
      const pk = effKey(r.addressKey);
      if (!r.type || actions[r.externalId] === "skip") {
        batch.rooms.push({ action: "skip", external_id: r.externalId });
        continue;
      }
      const tk = `${pk}|${r.type.code}`;
      if (!seen.has(tk)) {
        seen.add(tk);
        batch.room_types.push({ key: tk, property_key: pk, name: r.type.name, code: r.type.code, capacity: capacity[r.type.code] });
      }
      batch.rooms.push({
        action: actions[r.externalId], external_id: r.externalId, link_room_id: links[r.externalId] || null,
        property_key: pk, type_key: tk, number: numbers[r.externalId].trim(), floor: null,
        title: r.title, url: r.url, needs_review: true, // floor is never in the export
      });
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("import_wp_rooms", { _batch: batch } as never);
    setBusy(false);
    if (error) return toast.error(friendlyError(t, error));
    setResult(data as unknown as ImportResult);
    setStep(5);
    toast.success(t("import.done"));
  };

  const stepper = (
    <ol className="flex flex-wrap gap-2 text-xs mb-4">
      {[1, 2, 3, 4].map((n) => (
        <li key={n} className={`px-2.5 py-1 rounded-full border ${step === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
          {n}. {t(`import.step${n}`)}
        </li>
      ))}
    </ol>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div>
        <h2 className="font-semibold">{t("import.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("import.intro")}</p>
      </div>
      {loadError && <p className="text-xs text-destructive">{t("import.loadError")}</p>}
      {step <= 4 && stepper}

      {step === 1 && (
        <label className="flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:bg-accent/40">
          <Upload className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm font-medium">{t("import.chooseFiles")}</span>
          <span className="text-xs text-muted-foreground text-center">{t("import.chooseHint")}</span>
          <input type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm">{t("import.found", { rooms: rooms.length, groups: groups.length })}
            {listingCount != null && <> {t("import.listings", { n: listingCount })}</>}</p>
          <div className="rounded-lg border border-border divide-y divide-border">
            {groups.map((g) => {
              const d = decisions[g.key];
              const value = d?.mode === "existing" ? `e:${d.id}` : d?.mode === "merge" ? `m:${d.into}` : "new";
              return (
                <div key={g.key} className="p-3 grid md:grid-cols-[1fr_260px] gap-2 items-center text-sm">
                  <div>
                    <div className="font-medium">{g.city} — {g.street}</div>
                    <div className="text-xs text-muted-foreground">{t("import.roomsInFile", { n: g.rooms.length })}</div>
                  </div>
                  <div className="space-y-1">
                    <select className={`${sel} w-full`} value={value} onChange={(e) => {
                      const v = e.target.value;
                      setDecisions((s) => ({ ...s, [g.key]: v === "new" ? { mode: "new", name: `Pension ${g.city} — ${g.street}` }
                        : v.startsWith("e:") ? { mode: "existing", id: v.slice(2) } : { mode: "merge", into: v.slice(2) } }));
                    }}>
                      <option value="new">{t("import.createNew")}</option>
                      <optgroup label={t("import.existing")}>
                        {props.map((p) => <option key={p.id} value={`e:${p.id}`}>{p.name}</option>)}
                      </optgroup>
                      <optgroup label={t("import.mergeWith")}>
                        {groups.filter((o) => o.key !== g.key).map((o) => <option key={o.key} value={`m:${o.key}`}>{o.city} — {o.street}</option>)}
                      </optgroup>
                    </select>
                    {d?.mode === "new" && (
                      <input className={inp} value={d.name} maxLength={120}
                        onChange={(e) => setDecisions((s) => ({ ...s, [g.key]: { mode: "new", name: e.target.value } }))} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {badDecision && <p className="text-xs text-destructive">{t("import.badDecision")}</p>}
          <div className="flex justify-between">
            <button className="px-3 py-2 rounded-md border border-border text-sm" onClick={() => setStep(1)}>{t("import.back")}</button>
            <button disabled={badDecision} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" onClick={() => setStep(3)}>{t("import.next")}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">{t("import.typesTitle")}</h3>
            <p className="text-xs text-muted-foreground mb-2">{t("import.typesHint")}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {typeCodes.map((code) => {
                const name = rooms.find((r) => r.type?.code === code)?.type?.name;
                const needs = rooms.find((r) => r.type?.code === code)?.type?.capacity == null;
                return (
                  <div key={code} className="flex items-center gap-2 text-xs rounded-md border border-border p-2">
                    <span className="flex-1">{name} <span className="text-muted-foreground">({code})</span></span>
                    <span className="text-muted-foreground">{t("import.capacity")}</span>
                    <input type="number" min={1} max={20} className={`${inp} !w-16 ${needs && !capacity[code] ? "border-destructive" : ""}`}
                      value={capacity[code] ?? ""} onChange={(e) => setCapacity((s) => ({ ...s, [code]: Number(e.target.value) }))} />
                  </div>
                );
              })}
            </div>
            {missingCapacity.length > 0 && <p className="text-xs text-destructive mt-1">{t("import.capacityMissing")}</p>}
          </div>

          {groups.filter((g) => decisions[g.key]?.mode !== "merge").map((g) => {
            const members = groups.filter((o) => effKey(o.key) === g.key).flatMap((o) => o.rooms.map((r) => ({ r, o })));
            const pid = targetPropId(g.key);
            const linkable = exRooms.filter((x) => x.property_id === pid && !x.external_source_id);
            const title = decisions[g.key]?.mode === "existing" ? props.find((p) => p.id === pid)?.name : (decisions[g.key] as { name: string }).name;
            return (
              <div key={g.key} className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-sm font-medium">{title} · {t("import.roomsInFile", { n: members.length })}</div>
                <div className="divide-y divide-border">
                  {members.sort((a, b) => (numbers[a.r.externalId] ?? "").localeCompare(numbers[b.r.externalId] ?? "", "de", { numeric: true })).map(({ r, o }) => {
                    const issues = roomIssues(r, o);
                    const already = exRooms.some((x) => x.external_source_id === r.externalId);
                    return (
                      <div key={r.externalId} className="px-3 py-2 grid md:grid-cols-[1fr_110px_140px_180px] gap-2 items-center text-xs">
                        <div className="min-w-0">
                          {/* Plain text only – CSV content is never rendered as HTML */}
                          <div className="truncate" title={r.title}>{r.title}</div>
                          <div className="text-muted-foreground">
                            WP #{r.externalId} · {r.type?.name ?? "?"} · {t("import.floorMissing")}
                            {guessed[r.externalId] && <> · {t("import.numberGuessed")}</>}
                            {already && <> · <span className="text-primary">{t("import.alreadyImported")}</span></>}
                          </div>
                          {issues.length > 0 && <div className="text-destructive">{issues.join(" · ")}</div>}
                        </div>
                        <input className={inp} value={numbers[r.externalId] ?? ""} maxLength={20} aria-label={t("import.number")}
                          onChange={(e) => setNumbers((s) => ({ ...s, [r.externalId]: e.target.value }))} />
                        <select className={sel} value={actions[r.externalId]} onChange={(e) => setActions((s) => ({ ...s, [r.externalId]: e.target.value as RoomAction }))}>
                          <option value="create">{already ? t("import.actUpdate") : t("import.actCreate")}</option>
                          {linkable.length > 0 && !already && <option value="link">{t("import.actLink")}</option>}
                          <option value="skip">{t("import.actSkip")}</option>
                        </select>
                        {actions[r.externalId] === "link" ? (
                          <select className={sel} value={links[r.externalId] ?? ""} onChange={(e) => setLinks((s) => ({ ...s, [r.externalId]: e.target.value }))}>
                            <option value="">{t("import.chooseRoom")}</option>
                            {linkable.map((x) => <option key={x.id} value={x.id}>#{x.number}</option>)}
                          </select>
                        ) : <span />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex justify-between">
            <button className="px-3 py-2 rounded-md border border-border text-sm" onClick={() => setStep(2)}>{t("import.back")}</button>
            <button disabled={missingCapacity.length > 0 || allIssues.length > 0} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" onClick={() => setStep(4)}>{t("import.next")}</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3 text-sm">
          <ul className="grid sm:grid-cols-2 gap-2">
            {[["newProps", counts.newProps], ["newTypes", counts.newTypes], ["create", counts.create], ["update", counts.update], ["skip", counts.skip], ["review", rooms.length - counts.skip]].map(([k, v]) => (
              <li key={k} className="rounded-md border border-border p-3 flex justify-between"><span>{t(`import.sum.${k}`)}</span><b>{v}</b></li>
            ))}
          </ul>
          <div className="flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{t("import.missingWarning", { missing: Math.max(0, REPORTED_TOTAL - rooms.length), total: REPORTED_TOTAL })} {t("import.noWubook")}</span>
          </div>
          <div className="flex justify-between">
            <button className="px-3 py-2 rounded-md border border-border text-sm" onClick={() => setStep(3)}>{t("import.back")}</button>
            <button disabled={busy} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50" onClick={runImport}>{busy ? t("import.running") : t("import.run")}</button>
          </div>
        </div>
      )}

      {step === 5 && result && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="w-5 h-5 text-primary" /> {t("import.done")}</div>
          <ul className="grid sm:grid-cols-2 gap-2">
            {([["newProps", result.properties_created], ["newTypes", result.room_types_created], ["create", result.rooms_created], ["update", result.rooms_updated], ["skip", result.rooms_skipped], ["review", result.needs_review], ["errors", 0]] as const).map(([k, v]) => (
              <li key={k} className="rounded-md border border-border p-3 flex justify-between"><span>{t(`import.sum.${k}`)}</span><b>{v}</b></li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("import.missingWarning", { missing: Math.max(0, REPORTED_TOTAL - rooms.length), total: REPORTED_TOTAL })}</p>
          <button className="px-3 py-2 rounded-md border border-border text-sm" onClick={() => { setStep(1); setRooms([]); }}>{t("import.again")}</button>
        </div>
      )}
    </div>
  );
}
