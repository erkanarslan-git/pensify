import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShiftPanel } from "@/components/shift-panel";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Mesaim — Pensify" }, { name: "description", content: "Pensify'da güncel mesai durumunuz ve başla/ara ver/bitir işlemleri." }, { property: "og:title", content: "Mesaim — Pensify" }, { property: "og:description", content: "Pensify'da güncel mesai durumunuz ve başla/ara ver/bitir işlemleri." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: MePage,
});

// "Mesaim" shortcut: current status + actions only. Starting requires scanning the location QR.
function MePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/80 backdrop-blur sticky top-0">
        <div className="font-semibold tracking-tight">{t("shift.title")}</div>
        <button onClick={signOut} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <LogOut className="w-3.5 h-3.5" /> {t("shift.signOut")}
        </button>
      </header>
      <main className="max-w-md mx-auto p-4">
        <ShiftPanel property={null} token={null} />
      </main>
    </div>
  );
}
