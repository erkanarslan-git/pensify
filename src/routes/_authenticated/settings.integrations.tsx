import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plug, Landmark, ArrowUpRight } from "lucide-react";
import { getIntegrationOverview } from "@/lib/integration-status.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/app-shell";
export const Route = createFileRoute("/_authenticated/settings/integrations")({
  head: () => ({ meta: [{ title: "Entegrasyonlar — Pension Highway" }, { name: "description", content: "WuBook ve banka bağlantılarının gerçek hazırlık durumunu inceleyin." }, { property: "og:title", content: "Entegrasyonlar — Pension Highway" }, { property: "og:description", content: "WuBook ve banka bağlantılarının gerçek hazırlık durumunu inceleyin." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: IntegrationPage,
});
function IntegrationPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["integration-overview"], queryFn: () => getIntegrationOverview() });
  if (q.isError) return <p role="alert" className="text-destructive">{t("integrations.failed")}</p>;
  if (!q.data) return <p className="text-muted-foreground">{t("common.loading")}</p>;
  return <section className="space-y-5"><h2 className="text-lg font-semibold">{t("integrations.title")}</h2>
    {!q.data.channels && !q.data.bank && <p>{t("integrations.forbidden")}</p>}
    {q.data.channels && <div className="border-b border-border pb-5 space-y-3"><h3 className="flex items-center gap-2 font-semibold"><Plug className="h-5 w-5" />{t("integrations.channels")}<Badge tone={q.data.channels.state === "error" ? "destructive" : "info"}>{t(`integrations.${q.data.channels.state}`)}</Badge></h3>
      {(["configurationMissing", "accountMissing", "mappingMissing"] as const).filter((key) => q.data.channels?.[key]).map((key) => <p key={key} className="text-sm text-muted-foreground">{t(`integrations.${key}`)}</p>)}
      <p className="text-sm text-muted-foreground">{t("integrations.protected")}</p><Button variant="outline" asChild><Link to="/channel-sync">{t("integrations.open")}<ArrowUpRight className="h-4 w-4" /></Link></Button>
    </div>}
    {q.data.bank && <div className="space-y-3"><h3 className="flex items-center gap-2 font-semibold"><Landmark className="h-5 w-5" />{t("integrations.bank")}<Badge tone="warning">{t(`integrations.${q.data.bank.state}`)}</Badge></h3><p className="text-sm text-muted-foreground">{t("integrations.providerMissing")}</p><Button variant="outline" asChild><Link to="/payments/bank">{t("integrations.open")}<ArrowUpRight className="h-4 w-4" /></Link></Button></div>}
  </section>;
}