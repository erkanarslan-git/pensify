import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section } from "@/components/app-shell";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import i18n from "@/i18n";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: `${i18n.t("nav.aiAssistant", { defaultValue: "AI Asistan" })} — Pensify` }] }),
  component: AiPage,
});

const SUGGESTIONS = [
  "3 numaralı oda önümüzdeki hafta boş mu?",
  "Bu ay doluluk oranımız nedir?",
  "Son 12 ayı değerlendir, en iyi ve en zayıf aylar hangileri?",
  "Bu hafta hangi pansiyonda temizlik yükü en yoğun?",
  "Önümüzdeki yıl için 5 somut öneri ver",
  "Kanal bazında bu yılın cirosunu göster",
];

function AiPage() {
  const [input, setInput] = useState("");
  const [transport] = useState(() => new DefaultChatTransport({
    api: "/api/chat",
    fetch: async (url, init) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = new Headers(init?.headers);
      if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
      return fetch(url, { ...init, headers });
    },
  }));

  const { messages, sendMessage, status, setMessages, error } = useChat({
    id: "pensify-ai",
    transport,
    onError: (e) => toast.error(e.message || "AI hata verdi"),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const isBusy = status === "submitted" || status === "streaming";

  const send = (text: string) => {
    const t = text.trim();
    if (!t || isBusy) return;
    sendMessage({ text: t });
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  return (
    <AppShell
      title="AI Asistan"
      subtitle="Pansiyon verinize dayalı akıllı yanıtlar"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMessages([])}
          disabled={isBusy || messages.length === 0}
          className="gap-1.5"
        >
          <RotateCcw className="w-4 h-4" /> Sıfırla
        </Button>
      }
    >
      <div className="flex flex-col gap-4 h-[calc(100vh-10rem)]">
        <Section title="Sohbet">
          <div ref={scrollRef} className="h-[52vh] overflow-y-auto -m-5 p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 grid place-items-center mb-3">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Doluluk, boş odalar, ciro veya öneri sorabilirsiniz.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-accent transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Düşünüyor…
              </div>
            )}
            {error && <div className="text-xs text-destructive">{error.message}</div>}
          </div>
        </Section>

        <div className="rounded-2xl border border-border bg-card shadow-soft p-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Sorunuzu yazın… (Enter gönderir, Shift+Enter yeni satır)"
              className="min-h-[52px] max-h-40 resize-none border-0 focus-visible:ring-0 shadow-none"
              disabled={isBusy}
            />
            <Button onClick={() => send(input)} disabled={isBusy || !input.trim()} size="icon" className="shrink-0">
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 px-1">
            Yanıtlar mevcut rezervasyon, oda ve temizlik verinize dayanır. Sohbet sunucuda tutulmaz.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .map((p: any) => (p.type === "text" ? p.text : ""))
    .join("");
  const toolCalls = message.parts.filter((p: any) => p.type?.startsWith?.("tool-"));
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {!isUser && toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {toolCalls.map((tc: any, i: number) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-border text-muted-foreground"
              >
                {String(tc.type).replace(/^tool-/, "🔧 ")}
              </span>
            ))}
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
            <ReactMarkdown>{text || "…"}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
