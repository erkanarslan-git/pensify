import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { SALES_CHANNELS, summarizeDistribution, toggleChannel, type SalesChannel, type SyncMode } from "@/lib/sales-channels";

interface Row { id: string; number: string; property_id: string; active: boolean; channel_sync_mode: SyncMode; sales_channels: string[] }
interface Prop { id: string; name: string }

const btn = "inline-flex items-center px-2.5 py-1.5 rounded-md border border-border text-xs hover:bg-accent disabled:opacity-50";

export function RoomSalesChannels({ propertyId }: { propertyId?: string }) {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canManage = perms.can("manage_rooms");
  const [rows, setRows] = useState<Row[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [prop, setProp] = useState(propertyId ?? "");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    let rq = supabase.from("rooms").select("id,number,property_id,active,channel_sync_mode,sales_channels");
    if (propertyId) rq = rq.eq("property_id", propertyId);
    const [r, p] = await Promise.all([rq, supabase.from("properties").select("id,name").order("name")]);
    if (r.error || p.error) { console.error("[sales-channels]", r.error ?? p.error); setFailed(true); setLoading(false); return; }
    setFailed(false);
    setRows(((r.data ?? []) as Row[]).sort((a, b) => a.number.localeCompare(b.number, "de", { numeric: true })));
    setProps((p.data ?? []) as Prop[]);
    setLoading(false);
  }, [propertyId]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => rows.filter((r) => (!prop || r.property_id === prop) && r.number.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (props.find((p) => p.id === a.property_id)?.name ?? "").localeCompare(props.find((p) => p.id === b.property_id)?.name ?? "", "de") || a.number.localeCompare(b.number, "de", { numeric: true })), [rows, props, prop, q]);
  const sum = summarizeDistribution(visible);
  const propName = (id: string) => props.find((p) => p.id === id)?.name ?? "";

  const save = async (ids: string[], mode: SyncMode | null, channels: (r: Row) => string[] | null) => {
    setBusy(true);
    // Group rooms by resulting channel list so each RPC call writes one value.
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const row = rows.find((x) => x.id === id)!;
      const ch = channels(row);
      const key = ch === null ? "__keep" : ch.join(",");
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    for (const [key, group] of groups) {
      const { error } = await supabase.rpc("set_rooms_distribution", {
        _room_ids: group, _mode: mode, _channels: key === "__keep" ? null : key ? key.split(",") : [],
      } as never);
      if (error) { console.error("[sales-channels] save", error); toast.error(t("salesChannels.error")); setBusy(false); load(); return; }
    }
    setBusy(false);
    toast.success(t("salesChannels.saved"));
    load();
  };

  const selIds = [...sel].filter((id) => visible.some((r) => r.id === id));
  const allSelected = visible.length > 0 && selIds.length === visible.length;

  if (loading && !rows.length) return <div className="text-sm text-muted-foreground">…</div>;
  if (failed) return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      {t("salesChannels.loadError")} <button className={`${btn} ml-2`} onClick={load}>{t("salesChannels.retry")}</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("salesChannels.hint")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 [&>*]:min-w-0">
        {[["total", sum.total], ["api", sum.api], ["manual", sum.manual], ["notListed", sum.notListed], ...SALES_CHANNELS.map((c) => [c, sum.perChannel[c]])].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-[11px] text-muted-foreground truncate">{t(`salesChannels.${k}`)}</div>
            <div className="text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("salesChannels.search")} className="px-3 py-2 rounded-md border border-input bg-card text-sm w-40" />
        {!propertyId && (
          <select value={prop} onChange={(e) => setProp(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-card text-sm min-w-0 max-w-full">
            <option value="">{t("salesChannels.allLocations")}</option>
            {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {canManage && selIds.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-card p-2 text-xs shadow-sm">
          <span className="font-medium">{t("salesChannels.selected", { n: selIds.length })}</span>
          <button disabled={busy} className={btn} onClick={() => save(selIds, "api", () => null)}>{t("salesChannels.setApi")}</button>
          <button disabled={busy} className={btn} onClick={() => save(selIds, "manual", () => null)}>{t("salesChannels.setManual")}</button>
          {SALES_CHANNELS.map((c) => (
            <span key={c} className="inline-flex gap-1">
              <button disabled={busy} className={btn} onClick={() => save(selIds, null, (r) => SALES_CHANNELS.filter((x) => x === c || r.sales_channels.includes(x)))}>+ {t(`salesChannels.${c}`)}</button>
              <button disabled={busy} className={btn} onClick={() => save(selIds, null, (r) => r.sales_channels.filter((x) => x !== c))}>− {t(`salesChannels.${c}`)}</button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {canManage && visible.length > 0 && (
          <label className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(visible.map((r) => r.id)))} />
            {t("salesChannels.selectAll")}
          </label>
        )}
        {visible.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground">{t("salesChannels.empty")}</div>}
        {visible.map((r) => (
          <div key={r.id} className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4 ${r.active ? "" : "opacity-60"}`}>
            <div className="flex min-w-0 items-center gap-2 sm:w-64">
              {canManage && <input type="checkbox" aria-label={r.number} checked={sel.has(r.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />}
              <div className="min-w-0">
                <div className="font-semibold text-sm [overflow-wrap:anywhere]">#{r.number}{!r.active && <span className="ml-1 text-xs font-normal text-muted-foreground">({t("salesChannels.inactive")})</span>}</div>
                {!propertyId && <div className="text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{propName(r.property_id)}</div>}
              </div>
            </div>
            <div role="radiogroup" aria-label={t("salesChannels.mode")} className="inline-flex shrink-0 overflow-hidden rounded-full border border-border text-xs sm:w-auto">
              {(["manual", "api"] as const).map((m) => {
                const on = r.channel_sync_mode === m;
                return (
                  <button key={m} role="radio" aria-checked={on} disabled={!canManage || busy || on}
                    onClick={() => save([r.id], m, () => null)}
                    className={`px-3 py-1 transition-colors disabled:cursor-default ${on ? (m === "manual" ? "bg-warning text-warning-foreground font-semibold" : "bg-success text-success-foreground font-semibold") : "text-muted-foreground hover:bg-accent"}`}>
                    {t(m === "manual" ? "salesChannels.manual" : "salesChannels.api")}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SALES_CHANNELS.map((c: SalesChannel) => {
                const on = r.sales_channels.includes(c);
                return (
                  <button key={c} disabled={!canManage || busy} aria-pressed={on}
                    onClick={() => save([r.id], null, () => toggleChannel(r.sales_channels, c))}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-default ${on ? "font-semibold text-[var(--channel-fg)] border-transparent bg-[var(--channel-bg)]" : "border-border text-muted-foreground hover:bg-accent"}`}
                    style={{ "--channel-bg": `var(--channel-${c})`, "--channel-fg": `var(--channel-${c}-foreground)` } as React.CSSProperties}>
                    {t(`salesChannels.${c}`)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
