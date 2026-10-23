import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ShiftPanel } from "@/components/shift-panel";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Mesaim — Pensify" }, { name: "description", content: "Pensify'da güncel mesai durumunuz ve başla/ara ver/bitir işlemleri." }, { property: "og:title", content: "Mesaim — Pensify" }, { property: "og:description", content: "Pensify'da güncel mesai durumunuz ve başla/ara ver/bitir işlemleri." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: MePage,
});

// "Mesaim" shortcut: current status + actions only. Starting requires scanning the location QR.
function MePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <AppShell title={t("shift.title")}>
      <div className="max-w-md mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => {
          if (window.history.length > 1) window.history.back();
          else navigate({ to: "/" });
        }}>
          <ArrowLeft /> {t("shift.back")}
        </Button>
        <ShiftPanel property={null} token={null} />
      </div>
    </AppShell>
  );
}
