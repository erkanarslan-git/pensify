import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Section, Badge } from "@/components/app-shell";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Play, Pause, Square, MapPin, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import i18n from "@/i18n";

export const Route = createFileRoute("/_authenticated/clock/$token")({
  head: () => ({ meta: [{ title: `${i18n.t("timeTracking.clockTitle")} — Pensify` }] }),
  component: ClockPage,
});

// Haversine distance in meters
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      setPending(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setPending(false);
      },
      (err) => {
        setError(err.message);
        setPending(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { coords, error, pending };
}

function ClockPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const geo = useGeolocation();

  const { data: ctx, isLoading } = useQuery({
    queryKey: ["clock-ctx", token],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      const { data: prop, error: pe } = await supabase
        .from("properties")
        .select("id, name, address, latitude, longitude, geofence_radius_m")
        .eq("qr_token", token)
        .maybeSingle();
      if (pe) throw pe;
      if (!prop) throw new Error(t("timeTracking.unknownQr"));
      const { data: cleaner } = await supabase
        .from("cleaners")
        .select("id, full_name, active")
        .eq("user_id", user.user.id)
        .maybeSingle();
      const { data: open } = await supabase
        .from("time_entries")
        .select("id, property_id, clock_in_at, break_minutes, break_started_at, status")
        .eq("cleaner_id", cleaner?.id ?? "00000000-0000-0000-0000-000000000000")
        .is("clock_out_at", null)
        .maybeSingle();
      return { property: prop, cleaner, openShift: open };
    },
  });

  const hasPropCoords =
    ctx?.property?.latitude != null && ctx.property?.longitude != null;
  const distance =
    hasPropCoords && geo.coords
      ? distanceM(geo.coords.lat, geo.coords.lng, ctx!.property.latitude!, ctx!.property.longitude!)
      : null;
  const radius = ctx?.property?.geofence_radius_m ?? 150;
  // Account for GPS/Wi-Fi accuracy: allow if the uncertainty circle overlaps the geofence.
  // Cap accuracy buffer at 500m to prevent IP-level false positives.
  const accuracyBuffer = Math.min(geo.coords?.accuracy ?? 0, 500);
  const effectiveDistance = distance != null ? Math.max(0, distance - accuracyBuffer) : null;
  // If property has no coords configured, can't enforce — allow.
  // If property has coords, require a fresh location AND effective distance within radius.
  const withinGeofence = !hasPropCoords
    ? true
    : geo.coords != null && effectiveDistance != null && effectiveDistance <= radius;

  const start = useMutation({
    mutationFn: async () => {
      if (!ctx?.cleaner) throw new Error(t("timeTracking.noCleanerLink"));
      if (hasPropCoords) {
        if (geo.pending || !geo.coords) throw new Error(t("timeTracking.gettingLocation"));
        if (!withinGeofence) throw new Error(t("timeTracking.outOfGeofence"));
      }
      // Auto-close any open shift at a different property
      if (ctx.openShift) {
        await supabase
          .from("time_entries")
          .update({ clock_out_at: new Date().toISOString(), status: "completed", notes: "auto-closed by new QR scan" })
          .eq("id", ctx.openShift.id);
      }
      const { error } = await supabase.from("time_entries").insert({
        cleaner_id: ctx.cleaner.id,
        property_id: ctx.property.id,
        clock_in_lat: geo.coords?.lat ?? null,
        clock_in_lng: geo.coords?.lng ?? null,
        clock_in_accuracy_m: geo.coords?.accuracy ?? null,
        source: "qr",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("timeTracking.started"));
      qc.invalidateQueries({ queryKey: ["clock-ctx", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBreak = useMutation({
    mutationFn: async () => {
      if (!ctx?.openShift) return;
      const now = new Date();
      if (ctx.openShift.break_started_at) {
        // resume
        const startedAt = new Date(ctx.openShift.break_started_at);
        const addMin = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60000));
        const { error } = await supabase
          .from("time_entries")
          .update({
            break_started_at: null,
            break_minutes: (ctx.openShift.break_minutes ?? 0) + addMin,
            status: "active",
          })
          .eq("id", ctx.openShift.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("time_entries")
          .update({ break_started_at: now.toISOString(), status: "on_break" })
          .eq("id", ctx.openShift.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clock-ctx", token] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const stop = useMutation({
    mutationFn: async () => {
      if (!ctx?.openShift) return;
      const now = new Date();
      let breakAdd = 0;
      if (ctx.openShift.break_started_at) {
        const startedAt = new Date(ctx.openShift.break_started_at);
        breakAdd = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60000));
      }
      const { error } = await supabase
        .from("time_entries")
        .update({
          clock_out_at: now.toISOString(),
          clock_out_lat: geo.coords?.lat ?? null,
          clock_out_lng: geo.coords?.lng ?? null,
          break_started_at: null,
          break_minutes: (ctx.openShift.break_minutes ?? 0) + breakAdd,
          status: "completed",
        })
        .eq("id", ctx.openShift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("timeTracking.ended"));
      qc.invalidateQueries({ queryKey: ["clock-ctx", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <AppShell title={t("timeTracking.clockTitle")}>{t("common.loading")}</AppShell>;
  }
  if (!ctx) return null;

  const sameProperty = ctx.openShift?.property_id === ctx.property.id;

  return (
    <AppShell title={ctx.property.name} subtitle={t("timeTracking.clockSubtitle")}>
      <div className="max-w-md mx-auto space-y-4">
        <Section title={t("timeTracking.location")}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" /> {ctx.property.address}
          </div>
          <div className="mt-3 text-sm">
            {geo.pending ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("timeTracking.gettingLocation")}</span>
            ) : geo.error ? (
              <span className="text-destructive text-xs">{geo.error}</span>
            ) : distance == null ? (
              <Badge tone="muted">{t("timeTracking.noPropertyCoords")}</Badge>
            ) : withinGeofence ? (
              <Badge tone="success"><CheckCircle2 className="w-3 h-3" /> {t("timeTracking.inRange", { d: Math.round(distance) })}</Badge>
            ) : (
              <Badge tone="destructive"><AlertTriangle className="w-3 h-3" /> {t("timeTracking.outOfRange", { d: Math.round(distance), max: ctx.property.geofence_radius_m })}</Badge>
            )}
          </div>
        </Section>

        {!ctx.cleaner ? (
          <Section title={t("timeTracking.noCleanerLinkTitle")}>
            <p className="text-sm text-muted-foreground">{t("timeTracking.noCleanerLink")}</p>
          </Section>
        ) : ctx.openShift && sameProperty ? (
          <Section title={t("timeTracking.activeShift")}>
            <ShiftLive entry={ctx.openShift} />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => toggleBreak.mutate()}
                className="px-3 py-3 rounded-md border border-border text-sm font-medium hover:bg-accent flex items-center justify-center gap-1.5"
              >
                <Pause className="w-4 h-4" />
                {ctx.openShift.break_started_at ? t("timeTracking.resume") : t("timeTracking.break")}
              </button>
              <button
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
                className="px-3 py-3 rounded-md bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 flex items-center justify-center gap-1.5"
              >
                <Square className="w-4 h-4" /> {t("timeTracking.end")}
              </button>
            </div>
          </Section>
        ) : (
          <Section title={t("timeTracking.readyToStart")}>
            {ctx.openShift && !sameProperty && (
              <p className="text-xs text-warning mb-3">{t("timeTracking.willAutoClose")}</p>
            )}
            <button
              onClick={() => start.mutate()}
              disabled={start.isPending || !withinGeofence}
              className="w-full px-3 py-4 rounded-md bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" /> {t("timeTracking.start")}
            </button>
          </Section>
        )}
      </div>
    </AppShell>
  );
}

function ShiftLive({ entry }: { entry: { clock_in_at: string; break_minutes: number; break_started_at: string | null } }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const startedAt = new Date(entry.clock_in_at).getTime();
  const breakOngoing = entry.break_started_at ? Math.round((now - new Date(entry.break_started_at).getTime()) / 60000) : 0;
  const breakTotal = entry.break_minutes + breakOngoing;
  const elapsedMin = Math.max(0, Math.round((now - startedAt) / 60000) - breakTotal);
  const h = Math.floor(elapsedMin / 60);
  const m = elapsedMin % 60;
  return (
    <div className="text-center">
      <div className="text-5xl font-mono font-semibold tabular-nums">{h}h {m.toString().padStart(2, "0")}m</div>
      <div className="text-xs text-muted-foreground mt-1">
        {t("timeTracking.startedAt")} {new Date(entry.clock_in_at).toLocaleTimeString()}
        {breakTotal > 0 && <> · {t("timeTracking.breakMin", { m: breakTotal })}</>}
        {entry.break_started_at && <> · <span className="text-warning">{t("timeTracking.onBreak")}</span></>}
      </div>
    </div>
  );
}
