import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ALL_ROLES, ROLE_LABEL, type AppRole } from "@/lib/permissions";
import { Hotel, LogOut, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/request-access")({
  head: () => ({ meta: [{ title: "Zugriff anfragen — Pensify" }] }),
  component: RequestAccessPage,
});

function RequestAccessPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<AppRole>("reception");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setSubmitting(true);
    const { data: ures } = await supabase.auth.getUser();
    const uid = ures?.user?.id;
    if (!uid) { toast.error("Nicht angemeldet"); setSubmitting(false); return; }
    const { error } = await (supabase as any)
      .from("access_requests")
      .insert({ user_id: uid, requested_role: role, message: message.trim() || null, status: "pending" });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
    toast.success("Anfrage gesendet");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Hotel className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">Pensify</div>
            <div className="text-xs text-muted-foreground">Zugriff anfragen</div>
          </div>
          <button onClick={signOut} className="ml-auto text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <LogOut className="w-3.5 h-3.5" /> Abmelden
          </button>
        </div>

        {sent ? (
          <div className="space-y-3 text-sm">
            <p className="text-foreground font-medium">Deine Anfrage wurde gesendet.</p>
            <p className="text-muted-foreground">Ein Administrator wird sie prüfen. Du erhältst Zugriff, sobald sie freigegeben wurde.</p>
            <button onClick={signOut} className="w-full mt-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">
              Abmelden
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Dein Konto hat noch keine Rolle. Bitte fordere unten Zugriff an — ein Administrator wird die Anfrage prüfen.
            </p>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Gewünschte Rolle</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AppRole)}
                className="px-3 py-2 rounded-md border border-input bg-card"
              >
                {ALL_ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Nachricht (optional)</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Wer du bist, für welche Pension du arbeitest…"
                className="px-3 py-2 rounded-md border border-input bg-card resize-none"
              />
            </label>
            <button
              onClick={submit}
              disabled={submitting}
              className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> {submitting ? "Wird gesendet…" : "Zugriff anfragen"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
