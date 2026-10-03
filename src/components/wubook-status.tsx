import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, PlugZap, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/app-shell";
import { getWuBookConfigStatus, testWuBookConnection } from "@/lib/wubook.functions";
import { usePermissions } from "@/hooks/use-permissions";

export function WuBookStatus() {
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getWuBookConfigStatus);
  const runTest = useServerFn(testWuBookConnection);
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    connected: boolean;
    testedAt: string;
    subaccounts: number | null;
    properties: number | null;
    errorMessage: string | null;
  } | null>(null);

  const { data: status } = useQuery({
    queryKey: ["wubook-config-status"],
    queryFn: () => fetchStatus(),
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  async function onTest() {
    setTesting(true);
    try {
      const res = await runTest();
      if (!res.ok) {
        toast.error(res.error === "rate_limited" ? "Zu viele Tests — bitte kurz warten." : "Test fehlgeschlagen");
        return;
      }
      setLastResult(res.result);
      if (res.result.connected) toast.success("WuBook-Verbindung OK");
      else toast.error(res.result.errorMessage ?? "Verbindung fehlgeschlagen");
      queryClient.invalidateQueries({ queryKey: ["wubook-config-status"] });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">WuBook Wired</h3>
          <Badge tone="warning">Shadow / Nur lesen</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onTest} disabled={testing || status?.configured === false}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verbindung testen"}
        </Button>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Anbieter</dt>
          <dd>WuBook Wired</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Corporate-Konto</dt>
          <dd>{status?.corporateCode ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Server-Schlüssel</dt>
          <dd>{status ? (status.configured ? "Konfiguriert" : `Fehlt: ${status.missing.join(", ")}`) : "…"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ausgehende Updates</dt>
          <dd>Deaktiviert</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex items-center gap-1">
            {lastResult ? (
              lastResult.connected ? (
                <><ShieldCheck className="h-3.5 w-3.5 text-green-600" /> Verbunden</>
              ) : (
                <><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> {lastResult.errorMessage ?? "Fehler"}</>
              )
            ) : (
              "Noch nicht getestet"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Zuletzt getestet</dt>
          <dd>{lastResult ? new Date(lastResult.testedAt).toLocaleString("de-DE") : "—"}</dd>
        </div>
        {lastResult?.connected && (
          <>
            <div>
              <dt className="text-muted-foreground">Unterkonten</dt>
              <dd>{lastResult.subaccounts ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Properties</dt>
              <dd>{lastResult.properties ?? "—"}</dd>
            </div>
          </>
        )}
      </dl>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Shadow-Modus: Es werden keine Updates an Booking.com, Airbnb oder Expedia gesendet. Pensify liest nur von WuBook.
      </p>
    </div>
  );
}
