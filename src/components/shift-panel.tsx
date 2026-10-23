import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Pause, Play, Square, MapPin, QrCode, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { clockErrorKey } from "@/i18n/clock";
import { readPositionOnce, shiftActions, shiftState, type ShiftAction } from "@/lib/shift-actions";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { canStartShift, type ShiftContext } from "@/lib/shift-context";
import { ClockQrScanner } from "@/components/clock-qr-scanner";

type Prop = { id: string; name: string; address?: string | null; latitude?: number | null; longitude?: number | null } | null;

const fmt = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("de-DE", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export const myShiftKey = ["my-shift"] as const;

export function ShiftPanel({ property, token }: { property: Prop; token: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<string | null>(null);

  const q = useQuery({
    queryKey: [...myShiftKey, property?.id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_shift_context", { _property_id: property?.id as unknown as string });
      if (error) throw error;
      return data as unknown as ShiftContext;
    },
  });

  const act = useMutation({
    mutationFn: async (a: ShiftAction) => {
      const open = q.data?.open;
      if (a === "start") {
        if (!q.data || !canStartShift(q.data)) throw new Error("no_staff_profile");
        if (!property) throw new Error("unknown_location");
        const needsLoc = property.latitude != null && property.longitude != null;
        const pos = needsLoc ? await readPositionOnce() : null;
        const { error } = await supabase.rpc("clock_start", {
          _property_id: property.id,
          _token: token as unknown as string,
          _lat: (pos?.lat ?? null) as unknown as number,
          _lng: (pos?.lng ?? null) as unknown as number,
          _accuracy: (pos?.accuracy ?? null) as unknown as number,
          _source: token ? "qr" : "manual",
        });
        if (error) throw error;
        return a;
      }
      if (!open) throw new Error("no_open_shift");
      if (a === "break" || a === "resume") {
        const { error } = await supabase.rpc(a === "break" ? "clock_break_start" : "clock_break_end", { _entry_id: open.id });
        if (error) throw error;
        return a;
      }
      const pos = await readPositionOnce().catch(() => null);
      const { error } = await supabase.rpc("clock_stop", {
        _entry_id: open.id,
        _lat: (pos?.lat ?? null) as unknown as number,
        _lng: (pos?.lng ?? null) as unknown as number,
      });
      if (error) throw error;
      return a;
    },
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: myShiftKey });
      const time = fmt(new Date());
      const key = { start: "started", break: "breakStarted", resume: "resumed", finish: "finished" }[a];
      const msg = t(`shift.${key}`, { time });
      setConfirm(msg);
      toast.success(msg);
    },
    onError: async (e: unknown) => {
      // Reconcile with server state before allowing a new attempt.
      await qc.invalidateQueries({ queryKey: myShiftKey });
      toast.error(t(clockErrorKey(e)));
    },
  });

  if (q.isLoading) return <div className="py-10 grid place-items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (q.isError) return <div role="alert" className="space-y-3 text-sm text-destructive"><p>{t(clockErrorKey(q.error))}</p><Button variant="outline" onClick={() => q.refetch()}>{t("shift.retry")}</Button></div>;
  if (!q.data) return null;
  const { cleaner, open } = q.data;
  if (!cleaner) return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{t("shift.notEmployeeTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t(q.data.status === "no_membership" ? "shift.noMembership" : q.data.can_manage_team ? "shift.managerGuidance" : "shift.employeeGuidance")}</p>
      <Button asChild variant="outline"><Link to={q.data.can_manage_team ? "/team" : "/"}>{t(q.data.can_manage_team ? "shift.openTeam" : "shift.returnHome")}</Link></Button>
    </div>
  );

  const pid = property?.id ?? open?.property_id ?? null;
  const state = shiftState(open, pid);
  const actions = shiftActions(open, pid).filter(a => a !== "start" || canStartShift(q.data));
  const openName = (open as { properties?: { name?: string } } | null)?.properties?.name ?? "";
  const busy = act.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl brand-tile p-5 shadow-soft">
        <div className="text-xs uppercase opacity-80">{t("shift.hello")}</div>
        <div className="text-xl font-semibold">{cleaner.full_name}</div>
        {(property?.name || openName) && (
          <div className="text-sm opacity-90 mt-1 inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {property?.name ?? openName}</div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-4">
        <div className="text-center">
          <div className="text-xs uppercase text-muted-foreground">{t(`shift.state.${state}`)}</div>
          {open && state !== "elsewhere" && <Elapsed entry={open} />}
        </div>

        {state === "elsewhere" && (
          <p className="text-sm text-warning flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {t("shift.elsewhere", { name: openName })}</p>
        )}
        {!open && !property && (
          <p className="text-sm text-muted-foreground flex gap-2 justify-center"><QrCode className="w-4 h-4 shrink-0" /> {t("shift.scanQr")}</p>
        )}
        {!property && canStartShift(q.data) && <ClockQrScanner />}

        <div className="grid gap-3">
          {actions.map((a) => (
            <Button
              key={a}
              variant={a === "finish" ? "destructive" : a === "start" ? "default" : "outline"}
              disabled={busy}
              onClick={() => act.mutate(a)}
              className="w-full min-h-16 rounded-lg text-lg font-semibold"
            >
              {busy && act.variables === a ? <Loader2 className="w-5 h-5 animate-spin" /> : a === "start" || a === "resume" ? <Play className="w-5 h-5" /> : a === "break" ? <Pause className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              {t(`shift.${a}`)}
            </Button>
          ))}
        </div>
        {busy && act.variables === "start" && <p className="text-xs text-center text-muted-foreground">{t("shift.gettingLocation")}</p>}
        {confirm && !busy && <p className="text-sm text-center text-success inline-flex w-full justify-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {confirm}</p>}
      </div>
    </div>
  );
}

function Elapsed({ entry }: { entry: { clock_in_at: string; break_minutes: number; break_started_at: string | null } }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const ongoing = entry.break_started_at ? Math.round((now - new Date(entry.break_started_at).getTime()) / 60000) : 0;
  const br = (entry.break_minutes ?? 0) + ongoing;
  const net = Math.max(0, Math.round((now - new Date(entry.clock_in_at).getTime()) / 60000) - br);
  return (
    <div className="mt-2">
      <div className="text-5xl font-mono font-semibold tabular-nums">{Math.floor(net / 60)}:{(net % 60).toString().padStart(2, "0")}</div>
      <div className="text-xs text-muted-foreground mt-1">
        {t("shift.since", { time: fmt(entry.clock_in_at) })}{br > 0 && <> · {t("shift.breakTotal", { m: br })}</>}
      </div>
    </div>
  );
}
