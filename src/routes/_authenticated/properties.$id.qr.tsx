import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section } from "@/components/app-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Printer, MapPin } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import i18n from "@/i18n";

export const Route = createFileRoute("/_authenticated/properties/$id/qr")({
  head: () => ({ meta: [{ title: `QR — ${i18n.t("nav.properties")} — Pensify` }] }),
  component: QrCardPage,
});

function QrCardPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["property-qr", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_property_qr", { _id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("not_found");
      return row;
    },
  });

  if (isLoading || !data) {
    return <AppShell title="QR">{t("common.loading")}</AppShell>;
  }

  const url = `${window.location.origin}/clock/${data.qr_token}`;

  return (
    <AppShell
      title={`QR · ${data.name}`}
      subtitle={t("timeTracking.qrSubtitle")}
      actions={
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          <Printer className="w-4 h-4" /> {t("timeTracking.print")}
        </button>
      }
    >
      <div className="max-w-md mx-auto print:max-w-full">
        <Section title={data.name}>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mb-4">
            <MapPin className="w-3 h-3" /> {data.address}
            {data.city_name && <span> · {data.city_name}</span>}
          </div>
          <div className="bg-white p-4 rounded-lg flex items-center justify-center">
            <QRCodeSVG value={url} size={400} level="M" marginSize={2} className="w-full max-w-[400px] h-auto" />
          </div>
          <div className="mt-4 text-center">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">{t("timeTracking.scanToClock")}</div>
            <div className="text-[11px] text-muted-foreground break-all mt-1">{url}</div>
            <div className="text-[11px] text-muted-foreground mt-2">
              ⌖ {t("common.geofence")}: {data.geofence_radius_m}m
              {data.latitude != null && data.longitude != null && (
                <> · {data.latitude.toFixed(4)}, {data.longitude.toFixed(4)}</>
              )}
            </div>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
