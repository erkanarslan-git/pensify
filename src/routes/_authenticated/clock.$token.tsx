import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ShiftPanel } from "@/components/shift-panel";

export const Route = createFileRoute("/_authenticated/clock/$token")({
  head: () => ({ meta: [{ title: "Zeiterfassung — Pension Highway" }, { name: "description", content: "Arbeitszeiten am Pension Highway Standort erfassen." }, { property: "og:title", content: "Zeiterfassung — Pension Highway" }, { property: "og:description", content: "Arbeitszeiten am Pension Highway Standort erfassen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ClockPage,
});

// QR landing: simple mobile clock screen, no dashboard. Scanning never starts work by itself.
function ClockPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const { data: property, isLoading } = useQuery({
    queryKey: ["clock-property", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_clock_property", { _token: token });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) ?? null;
    },
  });
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <header className="h-14 flex items-center px-4 border-b border-border bg-background/80 backdrop-blur sticky top-0">
        <Link to="/me" className="font-semibold tracking-tight">{t("shift.title")}</Link>
      </header>
      <main className="max-w-md mx-auto p-4">
        {isLoading ? (
          <div className="py-10 grid place-items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : !property ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">{t("clock.errors.unknown_location")}</div>
        ) : (
          <ShiftPanel property={property} token={token} />
        )}
      </main>
    </div>
  );
}
