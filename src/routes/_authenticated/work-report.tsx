import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, ExternalLink, History } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getWorkReport } from "@/lib/work-report.functions";
import { businessDate, BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { formatDateDE } from "@/lib/date-de";
import { presetRange, countTopics, dailySeries, byLocation, byStaff, filterItems, DONE_TOPICS, OPEN_TOPICS, type Topic, type WorkItem, type Preset } from "@/lib/work-report";
import { workReportTranslations } from "@/i18n/work-report";

const search = z.object({
  preset: fallback(z.string(), "today").default("today"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  property: fallback(z.string(), "").default(""),
  view: fallback(z.string(), "summary").default("summary"),
  topic: fallback(z.string(), "").default(""),
  staff: fallback(z.string(), "").default(""),
  room: fallback(z.string(), "").default(""),
  status: fallback(z.string(), "").default(""),
  source: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int(), 1).default(1),
});

export const Route = createFileRoute("/_authenticated/work-report")({
  validateSearch: zodValidator(search),
  head: () => ({ meta: [{ title: "Yapılan İşler — Pensify" }, { name: "description", content: "Rezervasyon, temizlik, bakım ve görevlerin dönemsel operasyon özeti." }, { property: "og:title", content: "Yapılan İşler — Pensify" }, { property: "og:description", content: "Rezervasyon, temizlik, bakım ve görevlerin dönemsel operasyon özeti." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: WorkReportPage,
});

const GROUPS: { key: "reservations" | "cleaning" | "issues" | "todos"; done: Topic[]; open: Topic[] }[] = [
  { key: "reservations", done: ["res_new", "res_cancelled"], open: [] },
  { key: "cleaning", done: ["clean_done"], open: ["clean_review", "clean_open"] },
  { key: "issues", done: ["issue_done"], open: ["issue_open"] },
  { key: "todos", done: ["todo_done"], open: ["todo_open", "todo_overdue"] },
];
const LOC_COLS: Topic[] = ["res_new", "res_cancelled", "clean_done", "clean_review", "clean_open", "issue_done", "issue_open"];
const PAGE = 25;
const PRESETS: Preset[] = ["today", "yesterday", "week", "month", "custom"];

function WorkReportPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith("tr") ? "tr" : i18n.language.startsWith("en") ? "en" : "de";
  const c = workReportTranslations[lang];
  const locale = lang === "tr" ? "tr-TR" : lang === "en" ? "en-GB" : "de-DE";
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/work-report" });
  const set = (patch: Partial<typeof s>) => navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });
  const preset = (PRESETS.includes(s.preset as Preset) ? s.preset : "today") as Preset;
  const range = presetRange(preset, businessDate(), { from: s.from, to: s.to });
  const fetchReport = useServerFn(getWorkReport);
  const q = useQuery({
    queryKey: ["work-report", range.from, range.to, s.property],
    queryFn: () => fetchReport({ data: { from: range.from, to: range.to, propertyId: s.property || undefined } }),
  });
  const [openItem, setOpenItem] = useState<WorkItem | null>(null);
  const fmt = (iso: string | null) => !iso ? c.none : iso.length <= 10 ? formatDateDE(iso) : new Date(iso).toLocaleString(locale, { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const items = q.data?.items ?? [];
  const counts = useMemo(() => countTopics(items), [items]);
  const filtered = useMemo(() => filterItems(items, { topic: s.topic, propertyId: s.property, staff: s.staff, room: s.room, status: s.status, source: s.source, q: s.q }), [items, s]);

  const filters = (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {PRESETS.map((p) => <button key={p} onClick={() => set({ preset: p, ...(p === "custom" ? { from: range.from, to: range.to } : {}) })} className={`px-3 py-1.5 text-xs rounded-md ${preset === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{c[p]}</button>)}
      </div>
      {preset === "custom" && <>
        <Input type="date" aria-label={c.from} value={s.from || range.from} onChange={(e) => set({ from: e.target.value })} className="h-9 w-40" />
        <Input type="date" aria-label={c.to} value={s.to || range.to} onChange={(e) => set({ to: e.target.value })} className="h-9 w-40" />
      </>}
      <select aria-label={c.location} value={s.property} onChange={(e) => set({ property: e.target.value })} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value="">{c.allLocations}</option>
        {(q.data?.properties ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <span className="text-xs text-muted-foreground ml-auto">{formatDateDE(range.from)}{range.from !== range.to && ` – ${formatDateDE(range.to)}`}</span>
    </div>
  );

  if (q.isLoading) return <AppShell title={c.title} subtitle={c.subtitle}>{filters}<p className="text-muted-foreground">{c.loading}</p></AppShell>;
  if (q.error) return <AppShell title={c.title} subtitle={c.subtitle}>{filters}<p className="text-destructive">{String(q.error.message).includes("Forbidden") ? c.forbidden : c.error}</p></AppShell>;

  const Num = ({ topic, value, propertyId }: { topic: Topic; value: number; propertyId?: string }) => (
    <button onClick={() => set({ view: "detail", topic, ...(propertyId ? { property: propertyId } : {}) })} className={`tabular-nums font-semibold hover:underline underline-offset-4 ${value === 0 ? "text-muted-foreground" : "text-primary"}`}>{value}</button>
  );

  const tabs = (
    <div className="flex gap-2 mb-4">
      {s.view !== "summary" && <Button variant="outline" size="sm" onClick={() => set({ view: "summary", topic: "", staff: "", room: "", status: "", source: "", q: "" })}><ArrowLeft className="h-4 w-4 mr-1" />{c.back}</Button>}
      <Button variant={s.view === "summary" ? "default" : "ghost"} size="sm" onClick={() => set({ view: "summary" })}>{c.summary}</Button>
      <Button variant={s.view === "detail" ? "default" : "ghost"} size="sm" onClick={() => set({ view: "detail" })}>{c.detail}</Button>
      <Button variant={s.view === "staff" ? "default" : "ghost"} size="sm" onClick={() => set({ view: "staff" })}>{c.staffView}</Button>
    </div>
  );

  return (
    <AppShell title={c.title} subtitle={c.subtitle}>
      {filters}
      {tabs}
      {q.data?.truncated && <p className="text-sm text-warning mb-3">{c.truncated}</p>}

      {s.view === "summary" && <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-medium"></th><th className="text-left px-4 py-2 font-medium">{c.done}</th><th className="text-left px-4 py-2 font-medium">{c.open}</th></tr></thead>
            <tbody className="divide-y divide-border">
              {GROUPS.map((g) => <tr key={g.key}>
                <td className="px-4 py-3 font-medium whitespace-nowrap">{c.groups[g.key]}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-x-5 gap-y-1">{g.done.map((t) => <span key={t} className="text-muted-foreground"><Num topic={t} value={counts[t]} /> <span className="ml-1">{c.topics[t]}</span></span>)}</div></td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-x-5 gap-y-1">{g.open.length ? g.open.map((t) => <span key={t} className="text-muted-foreground"><Num topic={t} value={counts[t]} /> <span className="ml-1">{c.topics[t]}</span></span>) : <span className="text-muted-foreground">{c.none}</span>}</div></td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <Section title={c.locTable}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-medium">{c.location}</th>{LOC_COLS.map((t) => <th key={t} className="text-right px-3 py-2 font-medium whitespace-nowrap">{c.topics[t]}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">
                {byLocation(items).map((r) => <tr key={r.propertyId}><td className="px-4 py-2.5">{r.name}</td>{LOC_COLS.map((t) => <td key={t} className="text-right px-3 py-2.5"><Num topic={t} value={r.counts[t]} propertyId={r.propertyId} /></td>)}</tr>)}
                {byLocation(items).length === 0 && <tr><td colSpan={LOC_COLS.length + 1} className="px-4 py-6 text-center text-muted-foreground">{c.empty}</td></tr>}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-muted-foreground">{c.todoNote}</p>
          </div>
        </Section>

        <Section title={c.chart}>
          <div className="h-56 px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySeries(items, range.from, range.to).map((r) => ({ ...r, label: formatDateDE(r.day).slice(0, 5) }))}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="reservations" name={c.topics.res_new} stackId="a" fill="var(--primary)" />
                <Bar dataKey="cleaning" name={c.topics.clean_done} stackId="a" fill="var(--success)" />
                <Bar dataKey="issues" name={c.topics.issue_done} stackId="a" fill="var(--warning)" />
                <Bar dataKey="todos" name={c.topics.todo_done} stackId="a" fill="var(--info)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>}

      {s.view === "detail" && <DetailList c={c} items={items} filtered={filtered} s={s} set={set} fmt={fmt} onOpen={setOpenItem} />}

      {s.view === "staff" && <Section title={c.staffView}>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left px-4 py-2 font-medium">{c.staff}</th>{DONE_TOPICS.concat(["clean_open", "issue_open"]).map((t) => <th key={t} className="text-right px-3 py-2 font-medium whitespace-nowrap">{c.topics[t]}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {byStaff(items).map((r) => <tr key={r.staffId}><td className="px-4 py-2.5">{r.name}</td>{DONE_TOPICS.concat(["clean_open", "issue_open"]).map((t) => <td key={t} className="text-right px-3 py-2.5"><button onClick={() => set({ view: "detail", topic: t, staff: r.staffId })} className={`tabular-nums font-semibold hover:underline ${r.counts[t] ? "text-primary" : "text-muted-foreground"}`}>{r.counts[t]}</button></td>)}</tr>)}
            {byStaff(items).length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">{c.empty}</td></tr>}
          </tbody>
        </table></div>
      </Section>}

      <Dialog open={!!openItem} onOpenChange={(o) => !o && setOpenItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{openItem && c.topics[openItem.topic]}</DialogTitle></DialogHeader>
          {openItem && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{c.item}</dt><dd>{openItem.title || c.none}</dd>
            <dt className="text-muted-foreground">{c.location}</dt><dd>{openItem.propertyName ?? c.none}</dd>
            <dt className="text-muted-foreground">{c.room}</dt><dd>{openItem.room ?? c.none}</dd>
            <dt className="text-muted-foreground">{c.staff}</dt><dd>{openItem.staff ?? c.none}</dd>
            <dt className="text-muted-foreground">{c.when}</dt><dd>{fmt(openItem.at)}</dd>
            <dt className="text-muted-foreground">{c.result}</dt><dd><Badge tone={DONE_TOPICS.includes(openItem.topic) ? "success" : "warning"}>{openItem.status}</Badge></dd>
            <dt className="text-muted-foreground">{c.source}</dt><dd>{openItem.source}</dd>
            <dt className="text-muted-foreground">{c.note}</dt><dd className="whitespace-pre-wrap break-words">{openItem.note || c.none}</dd>
          </dl>}
          {openItem && <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm"><Link to={openItem.kind === "reservation" ? "/reservations" : openItem.kind === "todo" ? "/todos" : "/cleaning"}><ExternalLink className="h-4 w-4 mr-1" />{c.open_record}</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/settings/logs" search={{ entityId: openItem.id }}><History className="h-4 w-4 mr-1" />{c.history}</Link></Button>
          </div>}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

type Copy = (typeof workReportTranslations)["tr"];
function DetailList({ c, items, filtered, s, set, fmt, onOpen }: { c: Copy; items: WorkItem[]; filtered: WorkItem[]; s: any; set: (p: any) => void; fmt: (i: string | null) => string; onOpen: (i: WorkItem) => void }) {
  const uniq = (f: (i: WorkItem) => string | null) => [...new Set(items.map(f).filter(Boolean) as string[])].sort();
  const staffOpts = [...new Map(items.filter((i) => i.staffId).map((i) => [i.staffId!, i.staff ?? "—"])).entries()];
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const page = Math.min(Math.max(1, s.page), pages);
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const exportCsv = () => {
    const head = [c.type, c.when, c.location, c.room, c.item, c.staff, c.status, c.source, c.note];
    const esc = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;
    const body = filtered.map((i) => [c.topics[i.topic], fmt(i.at), i.propertyName, i.room, i.title, i.staff, i.status, i.source, i.note].map(esc).join(";"));
    const blob = new Blob(["\ufeff" + [head.map(esc).join(";"), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pensify-work-report.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return <Section title={`${c.detail}${s.topic ? ` · ${c.topics[s.topic as Topic] ?? ""}` : ""} (${filtered.length})`} action={<Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" />{c.export}</Button>}>
    <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border">
      <select aria-label={c.type} className={sel} value={s.topic} onChange={(e) => set({ topic: e.target.value })}><option value="">{c.type}: {c.all}</option>{[...DONE_TOPICS, ...OPEN_TOPICS].map((t) => <option key={t} value={t}>{c.topics[t]}</option>)}</select>
      <select aria-label={c.staff} className={sel} value={s.staff} onChange={(e) => set({ staff: e.target.value })}><option value="">{c.staff}: {c.all}</option>{staffOpts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <select aria-label={c.room} className={sel} value={s.room} onChange={(e) => set({ room: e.target.value })}><option value="">{c.room}: {c.all}</option>{uniq((i) => i.room).map((r) => <option key={r} value={r}>{r}</option>)}</select>
      <select aria-label={c.status} className={sel} value={s.status} onChange={(e) => set({ status: e.target.value })}><option value="">{c.status}: {c.all}</option>{uniq((i) => i.status).map((r) => <option key={r} value={r}>{r}</option>)}</select>
      <select aria-label={c.source} className={sel} value={s.source} onChange={(e) => set({ source: e.target.value })}><option value="">{c.source}: {c.all}</option>{uniq((i) => i.source).map((r) => <option key={r} value={r}>{r}</option>)}</select>
      <Input placeholder={c.search} value={s.q} onChange={(e) => set({ q: e.target.value })} className="h-9 w-48" />
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground"><tr>{[c.when, c.type, c.location, c.room, c.item, c.staff, c.status].map((h) => <th key={h} className="text-left px-4 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">
        {rows.map((i) => <tr key={`${i.topic}-${i.id}`} onClick={() => onOpen(i)} className="cursor-pointer hover:bg-muted/40">
          <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{fmt(i.at)}</td>
          <td className="px-4 py-2.5 whitespace-nowrap">{c.topics[i.topic]}</td>
          <td className="px-4 py-2.5">{i.propertyName ?? c.none}</td>
          <td className="px-4 py-2.5">{i.room ?? c.none}</td>
          <td className="px-4 py-2.5 max-w-[16rem] truncate">{i.title}</td>
          <td className="px-4 py-2.5">{i.staff ?? c.none}</td>
          <td className="px-4 py-2.5"><Badge tone={DONE_TOPICS.includes(i.topic) ? "success" : i.topic === "todo_overdue" || i.topic === "clean_review" ? "destructive" : "warning"}>{i.status}</Badge></td>
        </tr>)}
        {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{c.empty}</td></tr>}
      </tbody>
    </table></div>
    {pages > 1 && <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border text-sm">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => set({ page: page - 1 })}>{c.prev}</Button>
      <span className="text-muted-foreground">{c.page} {page}/{pages}</span>
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => set({ page: page + 1 })}>{c.next}</Button>
    </div>}
  </Section>;
}
