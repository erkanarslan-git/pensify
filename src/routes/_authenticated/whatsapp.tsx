import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Badge, Section } from "@/components/app-shell";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Pensify" }] }),
  component: WhatsAppPage,
});

type CleaningStatus = "pending" | "accepted" | "in_progress" | "completed" | "problem";

const statusMeta: Record<CleaningStatus, { label: string; tone: "warning" | "info" | "success" | "destructive" | "muted" }> = {
  pending: { label: "Bekliyor", tone: "warning" },
  accepted: { label: "Kabul edildi", tone: "info" },
  in_progress: { label: "Devam ediyor", tone: "info" },
  completed: { label: "Tamamlandı", tone: "success" },
  problem: { label: "Sorun", tone: "destructive" },
};

interface Cleaner { id: string; full_name: string; phone: string | null; active: boolean }
interface Task {
  id: string;
  room_id: string;
  property_id: string;
  cleaner_id: string | null;
  due_at: string;
  status: CleaningStatus;
}
interface Room { id: string; number: string }
interface Property { id: string; name: string }

interface Msg {
  id: string;
  from: "system" | "cleaner";
  text: string;
  time: string;
  actions?: { label: string; status: CleaningStatus; taskId: string }[];
}

function WhatsAppPage() {
  const { t } = useTranslation();
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedCleanerId, setSelectedCleanerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: cl }, { data: ts }, { data: rm }, { data: pr }] = await Promise.all([
        supabase.from("cleaners").select("id,full_name,phone,active").eq("active", true).order("full_name"),
        supabase.from("cleaning_tasks").select("id,room_id,property_id,cleaner_id,due_at,status").order("due_at"),
        supabase.from("rooms").select("id,number"),
        supabase.from("properties").select("id,name"),
      ]);
      const cleanersList = (cl ?? []) as Cleaner[];
      setCleaners(cleanersList);
      setTasks((ts ?? []) as Task[]);
      setRooms((rm ?? []) as Room[]);
      setProperties((pr ?? []) as Property[]);
      if (!selectedCleanerId && cleanersList.length > 0) {
        setSelectedCleanerId(cleanersList[0].id);
      }
    })();
  }, [refreshKey]);

  const getRoom = (id: string) => rooms.find((r) => r.id === id);
  const getProperty = (id: string) => properties.find((p) => p.id === id);

  const cleaner = cleaners.find((c) => c.id === selectedCleanerId) ?? null;
  const cleanerTasks = useMemo(
    () => tasks.filter((x) => x.cleaner_id === selectedCleanerId),
    [tasks, selectedCleanerId],
  );

  // Build initial system messages from tasks
  const baseMessages: Msg[] = useMemo(() => {
    return cleanerTasks.slice(0, 5).map((task) => {
      const room = getRoom(task.room_id);
      const prop = getProperty(task.property_id);
      const due = new Date(task.due_at);
      return {
        id: `m-${task.id}`,
        from: "system" as const,
        text: `🧹 *Yeni Temizlik Görevi*\n\nPansiyon: ${prop?.name ?? "—"}\nOda: ${room?.number ?? "—"}\nÇıkış: ${due.toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}\nDurum: ${statusMeta[task.status].label}`,
        time: due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        actions: [
          { label: "Kabul Et", status: "accepted", taskId: task.id },
          { label: "Başla", status: "in_progress", taskId: task.id },
          { label: "Tamamla", status: "completed", taskId: task.id },
          { label: "Sorun Bildir", status: "problem", taskId: task.id },
        ],
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanerTasks]);

  const chat = selectedCleanerId ? (messages[selectedCleanerId] ?? baseMessages) : [];

  const updateTaskStatus = async (taskId: string, status: CleaningStatus) => {
    const { error } = await supabase
      .from("cleaning_tasks")
      .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
      .eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    if (selectedCleanerId) {
      const task = cleanerTasks.find((x) => x.id === taskId);
      const room = task ? getRoom(task.room_id) : undefined;
      const reply: Msg = {
        id: `m-r-${Date.now()}`,
        from: "cleaner",
        text:
          status === "accepted" ? `👍 Kabul edildi (Oda ${room?.number ?? ""})` :
          status === "in_progress" ? `Oda ${room?.number ?? ""} temizlemeye başladım` :
          status === "completed" ? `✅ Oda ${room?.number ?? ""} tamam` :
          status === "problem" ? `⚠️ Oda ${room?.number ?? ""} — sorun var, kontrol edin` :
          "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => ({
        ...prev,
        [selectedCleanerId]: [...(prev[selectedCleanerId] ?? baseMessages), reply],
      }));
    }
    setRefreshKey((k) => k + 1);
    toast.success(`Görev: ${statusMeta[status].label}`);
  };

  const sendMessage = () => {
    if (!input.trim() || !selectedCleanerId) return;
    const msg: Msg = {
      id: `m-s-${Date.now()}`,
      from: "system",
      text: input.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => ({
      ...prev,
      [selectedCleanerId]: [...(prev[selectedCleanerId] ?? baseMessages), msg],
    }));
    setInput("");
  };

  return (
    <AppShell title={t("pages.whatsapp.title")} subtitle="Temizlikçi iletişim kanalı (simülasyon)">
      {cleaners.length === 0 ? (
        <Section title="Temizlikçi bulunamadı">
          <div className="text-sm text-muted-foreground">
            Burada listeleyebilmemiz için önce <strong>Temizlikçiler</strong> sayfasından bir temizlikçi ekleyin.
            Eklediğiniz temizlikçiler otomatik olarak burada görünür.
          </div>
        </Section>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4">
          <Section title={`Temizlikçiler (${cleaners.length})`}>
            <div className="space-y-1 -m-2">
              {cleaners.map((c) => {
                const isActive = c.id === selectedCleanerId;
                const taskCount = tasks.filter((x) => x.cleaner_id === c.id).length;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCleanerId(c.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors ${isActive ? "bg-accent" : "hover:bg-accent/60"}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-success/15 text-success grid place-items-center text-xs font-semibold shrink-0">
                      {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.phone ?? "—"}</div>
                    </div>
                    {taskCount > 0 && (
                      <Badge tone="info">{taskCount}</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          <div className="rounded-xl border border-border bg-card shadow-soft flex flex-col h-[640px]">
            <div className="px-5 py-3 border-b border-border flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-success/15 text-success grid place-items-center text-xs font-semibold">
                {cleaner?.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "?"}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{cleaner?.full_name ?? "—"}</div>
                <div className="text-xs text-success">{cleaner?.phone ?? "online"}</div>
              </div>
              <Badge tone="success"><MessageCircle className="w-3 h-3" /> WhatsApp</Badge>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, oklch(0.85 0 0 / 0.2) 1px, transparent 0)",
              backgroundSize: "16px 16px",
            }}>
              {chat.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-10">
                  Bu temizlikçiye atanmış görev yok. <br />
                  <span className="opacity-70">Temizlik sayfasından görev atayın.</span>
                </div>
              )}
              {chat.map((m) => (
                <div key={m.id} className={`flex ${m.from === "cleaner" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-soft text-sm whitespace-pre-line ${
                    m.from === "cleaner"
                      ? "bg-success/15 text-foreground rounded-br-sm"
                      : "bg-card border border-border rounded-bl-sm"
                  }`}>
                    {m.text}
                    {m.actions && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.actions.map((a) => (
                          <button
                            key={a.label}
                            onClick={() => updateTaskStatus(a.taskId, a.status)}
                            className="text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-accent"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground text-right mt-1 inline-flex items-center gap-0.5 w-full justify-end">
                      {m.time}
                      {m.from === "system" && <CheckCheck className="w-3 h-3 text-info" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                placeholder="Mesaj yaz…"
                disabled={!selectedCleanerId}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || !selectedCleanerId}
                className="w-9 h-9 rounded-md bg-primary text-primary-foreground grid place-items-center disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {cleaner && (
        <div className="mt-6">
          <Section title={`${cleaner.full_name} – aktif görevler`}>
            <div className="space-y-2">
              {cleanerTasks.map((task) => {
                const room = getRoom(task.room_id);
                const prop = getProperty(task.property_id);
                return (
                  <div key={task.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{prop?.name} · Oda {room?.number}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(task.due_at).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <Badge tone={statusMeta[task.status].tone}>{statusMeta[task.status].label}</Badge>
                  </div>
                );
              })}
              {cleanerTasks.length === 0 && <div className="text-sm text-muted-foreground">Atanmış görev yok</div>}
            </div>
          </Section>
        </div>
      )}
    </AppShell>
  );
}
