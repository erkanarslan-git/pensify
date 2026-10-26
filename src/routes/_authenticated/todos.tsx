import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadError } from "@/components/load-error";
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { businessDate } from "@/lib/business-time";
import { formatDateDE } from "@/lib/date-de";
import { isOverdue, sortTodos } from "@/lib/todos";
import { loadTodoOptions } from "@/lib/todo-data.functions";
import { TodoDetails } from "@/components/todo-details";
import { Button } from "@/components/ui/button";
import { berlinLocalToIso } from "@/lib/business-time";

export const Route = createFileRoute("/_authenticated/todos")({
  head: () => ({ meta: [{ title: "Yapılacaklar — Pension Highway" }, { name: "description", content: "Pension Highway'da genel işleri öncelik, tarih ve gecikme takibiyle yönetin." }, { property: "og:title", content: "Yapılacaklar — Pension Highway" }, { property: "og:description", content: "Pension Highway'da genel işleri öncelik, tarih ve gecikme takibiyle yönetin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TodosPage,
});

interface Todo { id: string; title: string; due_date: string | null; priority: string; done: boolean; created_by: string | null; done_by: string | null; created_at: string; assigned_to: string | null; property_id: string | null; room_id: string | null; reservation_id: string | null; notes: string | null; due_at: string | null; recurrence:string; reminder_at:string|null }
type Filter = "open" | "overdue" | "today" | "mine" | "upcoming" | "done" | "all";
const PRIOS = ["low", "normal", "high", "urgent"] as const;
const prioCls: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

function TodosPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const today = businessDate();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [prio, setPrio] = useState<string>("normal");
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [assigned, setAssigned] = useState(""); const [property, setProperty] = useState("");
  const [room, setRoom] = useState(""); const [reservation, setReservation] = useState("");
  const [time, setTime] = useState(""); const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState("none"); const [reminder, setReminder] = useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [details, setDetails] = useState<Todo | null>(null);
  const { data: options } = useQuery({ queryKey: ["todo-options"], queryFn: () => loadTodoOptions() });
  const { data: links } = useQuery({ queryKey: ["todo-links", property], enabled: !!property, queryFn: async () => {
    const [rooms, reservations] = await Promise.all([supabase.from("rooms").select("id,number").eq("property_id", property), supabase.from("reservations").select("id,guest_name").eq("property_id", property).is("deleted_at", null).order("check_in", { ascending: false }).limit(100)]);
    return { rooms: rooms.data ?? [], reservations: reservations.data ?? [] };
  } });

  const { data: todos = [], isError: todosError, refetch: refetchTodos } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const rows: Todo[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("todos").select("id,title,due_date,due_at,notes,priority,done,created_by,done_by,created_at,assigned_to,property_id,room_id,reservation_id,recurrence,reminder_at").is("archived_at", null).order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
        if (error) throw error; rows.push(...(data ?? []) as Todo[]); if ((data?.length ?? 0) < 500) break;
      }
      return rows;
    },
  });
  const names = Object.fromEntries((options?.users ?? []).map(user => [user.id, user.name]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["todos"] });

  const add = async () => {
    if (!title.trim()) return;
    let dueAt: string | null = null; let reminderAt: string | null = null;
    try { dueAt = due && time ? berlinLocalToIso(`${due}T${time}`) : null; reminderAt = reminder ? berlinLocalToIso(reminder) : null; }
    catch { toast.error(t("todos.saveErr")); return; }
    const { error } = await supabase.rpc("save_general_todo", { _input: { id:editing, title: title.trim(), due_date: due || null, due_at: dueAt, priority: prio, notes, assigned_to: assigned || null, property_id: property || null, room_id: room || null, reservation_id: reservation || null, recurrence: repeat, reminder_at: reminderAt } });
    if (error) return toast.error(t("todos.saveErr"));
    setEditing(null); setTitle(""); setDue(""); setPrio("normal"); setAssigned(""); setProperty(""); setRoom(""); setReservation(""); setTime(""); setNotes(""); setRepeat("none"); setReminder(""); refresh();
  };
  const toggle = async (x: Todo) => {
    const { error } = await supabase.rpc("general_todo_action", { _id: x.id, _action: x.done ? "reopen" : "complete" });
    if (error) return toast.error(t("todos.saveErr"));
    refresh();
  };
  const remove = async (x: Todo) => {
    if (!window.confirm(t("todos.confirmDel"))) return;
    const { error } = await supabase.rpc("general_todo_action", { _id: x.id, _action: "archive" });
    if (error) return toast.error(t("todos.saveErr"));
    refresh();
  };

  const counts = {
    open: todos.filter((x) => !x.done).length,
    overdue: todos.filter((x) => isOverdue(x, today)).length,
    today: todos.filter((x) => !x.done && x.due_date === today).length,
    done: todos.filter((x) => x.done).length,
    all: todos.length,
    mine: todos.filter((x) => !x.done && x.assigned_to === options?.userId).length,
    upcoming: todos.filter((x) => !x.done && !!x.due_date && x.due_date > today).length,
  };
  const shown = useMemo(() => sortTodos(todos.filter((x) =>
    filter === "mine" ? !x.done && x.assigned_to === options?.userId : filter === "upcoming" ? !x.done && !!x.due_date && x.due_date > today : filter === "all" ? true : filter === "done" ? x.done : filter === "overdue" ? isOverdue(x, today) : filter === "today" ? !x.done && x.due_date === today : !x.done,
  ), today), [todos, filter, today, options?.userId]);

  const daysLate = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
  const locale = i18n.language?.startsWith("tr") ? "tr-TR" : i18n.language?.startsWith("en") ? "en-GB" : "de-DE";

  // Calendar grid (Monday first)
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, i) => {
    const d = i - offset + 1;
    return d < 1 || d > daysInMonth ? null : `${month}-${String(d).padStart(2, "0")}`;
  });
  const shiftMonth = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }));

  return (
    <AppShell title={t("todos.title")} subtitle={t("todos.subtitle")}>
      {details && <TodoDetails id={details.id} title={details.title} onClose={() => setDetails(null)} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label={t("todos.open")} value={counts.open} cls="brand-tile" />
        <Stat label={t("todos.overdue")} value={counts.overdue} cls={counts.overdue ? "bg-destructive/10 border border-destructive/30 text-destructive" : "border border-border bg-card"} />
        <Stat label={t("todos.today")} value={counts.today} cls="border border-border bg-card" />
        <Stat label={t("todos.done")} value={counts.done} cls="border border-border bg-card" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-3 mb-4 flex flex-wrap gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={t("todos.placeholder")} className="flex-1 min-w-[200px] px-3 py-2 rounded-md border border-input bg-background text-sm" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-background text-sm" />
        <select value={prio} onChange={(e) => setPrio(e.target.value)} className="px-3 py-2 rounded-md border border-input bg-background text-sm">
          {PRIOS.map((p) => <option key={p} value={p}>{t(`todos.p.${p}`)}</option>)}
        </select>
        <button onClick={add} disabled={!title.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"><Plus className="w-4 h-4" />{t(editing?"common.save":"todos.add")}</button>
      </div>

      <details className="mb-4"><summary className="cursor-pointer text-sm font-semibold">{t("todoDetails.details")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs">{t("todoDetails.assigned")}<select value={assigned} onChange={e => setAssigned(e.target.value)} className="w-full border border-input rounded-md bg-card p-2"><option value="">—</option>{options?.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="text-xs">{t("todoDetails.property")}<select value={property} onChange={e => { setProperty(e.target.value); setRoom(""); setReservation(""); }} className="w-full border border-input rounded-md bg-card p-2"><option value="">—</option>{options?.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-xs">{t("todoDetails.room")}<select disabled={!property} value={room} onChange={e => setRoom(e.target.value)} className="w-full border border-input rounded-md bg-card p-2"><option value="">—</option>{links?.rooms.map(r => <option key={r.id} value={r.id}>{r.number}</option>)}</select></label>
        <label className="text-xs">{t("todoDetails.reservation")}<select disabled={!property} value={reservation} onChange={e => setReservation(e.target.value)} className="w-full border border-input rounded-md bg-card p-2"><option value="">—</option>{links?.reservations.map(r => <option key={r.id} value={r.id}>{r.guest_name}</option>)}</select></label>
        <label className="text-xs">{t("todoDetails.time")}<input type="time" disabled={!due} value={time} onChange={e => setTime(e.target.value)} className="w-full border border-input rounded-md bg-card p-2" /></label>
        <label className="text-xs">{t("todoDetails.recurrence")}<select value={repeat} onChange={e => setRepeat(e.target.value)} className="w-full border border-input rounded-md bg-card p-2">{["none","daily","weekly","monthly"].map(r => <option key={r} value={r}>{t(`todoDetails.${r}`)}</option>)}</select></label>
        <label className="text-xs">{t("todoDetails.reminder")}<input type="datetime-local" value={reminder} onChange={e => setReminder(e.target.value)} className="w-full border border-input rounded-md bg-card p-2" /></label>
        <label className="text-xs sm:col-span-2">{t("todoDetails.notes")}<textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-input rounded-md bg-card p-2" /></label>
      </div>{reminder && <p className="mt-2 text-xs text-warning">{t("todoDetails.channel_unavailable")}</p>}</details>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex gap-1 p-1 rounded-xl bg-muted">
          {(["list", "calendar"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${view === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{t(`todos.${v}`)}</button>
          ))}
        </div>
        {view === "list" && (
          <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-muted">
            {(["open", "mine", "overdue", "today", "upcoming", "done", "all"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{t(["mine", "upcoming"].includes(f) ? `todoDetails.${f}` : `todos.${f}`)} ({counts[f]})</button>
            ))}
          </div>
        )}
      </div>

      {todosError ? (
        <LoadError onRetry={() => refetchTodos()} />
      ) : view === "list" ? (
        shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("todos.empty")}</div>
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {shown.map((x) => {
              const late = isOverdue(x, today);
              return (
                <div key={x.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${late ? "bg-destructive/5" : ""}`}>
                  <input type="checkbox" checked={x.done} onChange={() => toggle(x)} className="w-4 h-4 accent-primary" />
                  <div className="flex-1 min-w-0">
                    <Button variant="link" className={`h-auto p-0 text-left whitespace-normal ${x.done ? "line-through text-muted-foreground" : ""}`} onClick={() => setDetails(x)}>{x.title}</Button>
                    {x.assigned_to && <div className="text-xs text-muted-foreground">{options?.users.find(u => u.id === x.assigned_to)?.name ?? "—"}</div>}
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                      <span>{x.due_date ? formatDateDE(x.due_date) : t("todos.noDue")}</span>
                      {late && x.due_date && <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{t("todos.overdueDays", { n: daysLate(x.due_date) })}</span>}
                      {x.created_by && names[x.created_by] && <span>· {t("todos.by")}: {names[x.created_by]}</span>}
                      {x.done && x.done_by && names[x.done_by] && <span>· {t("todos.doneBy")}: {names[x.done_by]}</span>}
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${prioCls[x.priority] ?? prioCls.normal}`}>{t(`todos.p.${x.priority}`)}</span>
                  <Button variant="ghost" size="icon" aria-label={t("common.edit")} onClick={()=>{setEditing(x.id);setTitle(x.title);setDue(x.due_date??"");setPrio(x.priority);setAssigned(x.assigned_to??"");setProperty(x.property_id??"");setRoom(x.room_id??"");setReservation(x.reservation_id??"");setNotes(x.notes??"");setRepeat(x.recurrence);setReminder(x.reminder_at?new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(x.reminder_at)).replace(" ","T"):"");setTime(x.due_at?new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit"}).format(new Date(x.due_at)):"");window.scrollTo({top:0,behavior:"smooth"});}}><Pencil className="h-4 w-4"/></Button>
                  <button onClick={() => remove(x)} aria-label={t("todos.del")} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => shiftMonth(-1)} aria-label={t("todos.prev")} className="p-1.5 rounded-md hover:bg-accent"><ChevronLeft className="w-4 h-4" /></button>
            <div className="font-semibold">{first.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</div>
            <button onClick={() => shiftMonth(1)} aria-label={t("todos.next")} className="p-1.5 rounded-md hover:bg-accent"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground mb-1">{weekdays.map((w) => <div key={w} className="text-center">{w}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const items = d ? sortTodos(todos.filter((x) => x.due_date === d), today) : [];
              return (
                <div key={i} className={`min-h-[84px] rounded-md border p-1 ${d ? "border-border" : "border-transparent"} ${d === today ? "ring-2 ring-primary/40" : ""}`}>
                  {d && <div className="text-[11px] text-muted-foreground mb-0.5">{Number(d.slice(8))}</div>}
                  {items.slice(0, 3).map((x) => (
                    <button key={x.id} onClick={() => setDetails(x)} title={x.title} className={`block w-full text-left truncate text-[11px] px-1 py-0.5 mb-0.5 rounded ${x.done ? "line-through opacity-50 bg-muted" : isOverdue(x, today) ? "bg-destructive/15 text-destructive" : prioCls[x.priority]}`}>{x.title}</button>
                  ))}
                  {items.length > 3 && <div className="text-[10px] text-muted-foreground">+{items.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-2xl px-5 py-4 shadow-sm ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
