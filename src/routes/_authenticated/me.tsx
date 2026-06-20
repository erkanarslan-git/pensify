import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { Play, Pause, Square, LogOut, Loader2, QrCode, Building2, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Vardiyam — Pensify" }] }),
  component: MePage,
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

const MAX_GEOFENCE_ACCURACY_M = 2000;

function useGeolocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Konum desteklenmiyor");
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

type PropertyLite = {
  id: string;
  name: string;
  qr_token: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
};

function MePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const geo = useGeolocation();

  const ctx = useQuery({
    queryKey: ["me-shift"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { data: cleaner } = await supabase
        .from("cleaners")
        .select("id, full_name, phone, active")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!cleaner)
        return { user: u.user, cleaner: null, open: null, properties: [] as PropertyLite[], recent: [] };
      const { data: open } = await supabase
        .from("time_entries")
        .select("id, property_id, clock_in_at, break_minutes, break_started_at, status, properties(name)")
        .eq("cleaner_id", cleaner.id)
        .is("clock_out_at", null)
        .maybeSingle();
      const { data: properties } = await supabase
        .from("properties")
        .select("id, name, qr_token, latitude, longitude, geofence_radius_m")
        .order("name");
      const { data: recent } = await supabase
        .from("time_entries")
        .select("id, clock_in_at, clock_out_at, break_minutes, properties(name)")
        .eq("cleaner_id", cleaner.id)
        .not("clock_out_at", "is", null)
        .order("clock_in_at", { ascending: false })
        .limit(5);
      return {
        user: u.user,
        cleaner,
        open,
        properties: (properties ?? []) as PropertyLite[],
        recent: recent ?? [],
      };
    },
  });

  const [propertyId, setPropertyId] = useState<string>("");

  const selectedProperty = useMemo<PropertyLite | null>(() => {
    const list = ctx.data?.properties ?? [];
    return list.find((p) => p.id === propertyId) ?? null;
  }, [ctx.data?.properties, propertyId]);

  const distance =
    selectedProperty && selectedProperty.latitude != null && selectedProperty.longitude != null && geo.coords
      ? distanceM(geo.coords.lat, geo.coords.lng, selectedProperty.latitude, selectedProperty.longitude)
      : null;

  const hasCoords = !!(selectedProperty && selectedProperty.latitude != null && selectedProperty.longitude != null);
  const radius = selectedProperty?.geofence_radius_m ?? 150;
  // Account for GPS/Wi-Fi accuracy: allow if the uncertainty circle overlaps the geofence.
  const accuracy = geo.coords?.accuracy ?? 0;
  const accuracyTooLow = accuracy > MAX_GEOFENCE_ACCURACY_M;
  // If property has no coords configured, we cannot enforce — allow with a warning.
  const withinGeofence = !selectedProperty
    ? false
    : !hasCoords
      ? true
      : distance != null && distance <= radius + accuracy && !accuracyTooLow;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const start = useMutation({
    mutationFn: async () => {
      const c = ctx.data?.cleaner;
      if (!c) throw new Error("Hesabın bir temizlikçi kaydına bağlı değil. Lütfen yöneticinle iletişime geç.");
      if (!selectedProperty) throw new Error("Lokasyon seç");
      if (hasCoords) {
        if (geo.pending) throw new Error("Konum alınıyor, lütfen bekle…");
        if (!geo.coords) throw new Error("Konum izni gerekli. Tarayıcı ayarlarından izin ver.");
        if (accuracyTooLow || distance == null || distance > radius + accuracy) {
          throw new Error(
            `Lokasyona yeterince yakın değilsin (~${distance != null ? Math.round(distance) : "?"} m, izin ${radius} m, konum doğruluğu ±${Math.round(geo.coords.accuracy)} m).`,
          );
        }
      }
      const { error } = await supabase.from("time_entries").insert({
        cleaner_id: c.id,
        property_id: selectedProperty.id,
        clock_in_lat: geo.coords?.lat ?? null,
        clock_in_lng: geo.coords?.lng ?? null,
        clock_in_accuracy_m: geo.coords?.accuracy ?? null,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vardiya başladı");
      qc.invalidateQueries({ queryKey: ["me-shift"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBreak = useMutation({
    mutationFn: async () => {
      const open = ctx.data?.open;
      if (!open) return;
      const now = new Date();
      if (open.break_started_at) {
        const addMin = Math.max(
          0,
          Math.round((now.getTime() - new Date(open.break_started_at).getTime()) / 60000),
        );
        const { error } = await supabase
          .from("time_entries")
          .update({
            break_started_at: null,
            break_minutes: (open.break_minutes ?? 0) + addMin,
            status: "active",
          })
          .eq("id", open.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("time_entries")
          .update({ break_started_at: now.toISOString(), status: "on_break" })
          .eq("id", open.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-shift"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const stop = useMutation({
    mutationFn: async () => {
      const open = ctx.data?.open;
      if (!open) return;
      const now = new Date();
      let addMin = 0;
      if (open.break_started_at) {
        addMin = Math.max(
          0,
          Math.round((now.getTime() - new Date(open.break_started_at).getTime()) / 60000),
        );
      }
      const { error } = await supabase
        .from("time_entries")
        .update({
          clock_out_at: now.toISOString(),
          clock_out_lat: geo.coords?.lat ?? null,
          clock_out_lng: geo.coords?.lng ?? null,
          break_started_at: null,
          break_minutes: (open.break_minutes ?? 0) + addMin,
          status: "completed",
        })
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vardiya bitti");
      qc.invalidateQueries({ queryKey: ["me-shift"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ctx.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!ctx.data) return null;

  const { cleaner, open, properties, recent, user } = ctx.data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/80 backdrop-blur sticky top-0">
        <div className="font-semibold tracking-tight">Vardiyam</div>
        <button onClick={signOut} className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <LogOut className="w-3.5 h-3.5" /> Çıkış
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-xs uppercase text-muted-foreground">Merhaba</div>
          <div className="text-xl font-semibold">{cleaner?.full_name || user.email}</div>
          {cleaner?.phone && <div className="text-xs text-muted-foreground mt-0.5">{cleaner.phone}</div>}
        </div>

        {!cleaner && (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
            Hesabın henüz bir temizlikçi kaydına bağlı değil. Lütfen yöneticinle iletişime geç.
          </div>
        )}

        {cleaner && open ? (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {(open as any).properties?.name ?? "Vardiya"}
            </div>
            <Elapsed entry={open as any} />
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button
                onClick={() => toggleBreak.mutate()}
                disabled={toggleBreak.isPending}
                className="px-3 py-3 rounded-xl border border-border text-sm font-medium hover:bg-accent flex items-center justify-center gap-1.5"
              >
                <Pause className="w-4 h-4" />
                {open.break_started_at ? "Devam et" : "Mola"}
              </button>
              <button
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
                className="px-3 py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 flex items-center justify-center gap-1.5"
              >
                <Square className="w-4 h-4" /> Bitir
              </button>
            </div>
          </div>
        ) : cleaner ? (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
            <div className="text-sm font-medium">Vardiyayı başlat</div>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-3 py-3 rounded-md border border-input bg-card text-sm"
            >
              <option value="">Lokasyon seç…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {selectedProperty && (
              <div className="text-xs">
                {geo.pending ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Konum alınıyor…
                  </span>
                ) : geo.error ? (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5" /> {geo.error} — Tarayıcı konum iznini ver.
                  </span>
                ) : !hasCoords ? (
                  <span className="inline-flex items-center gap-1.5 text-warning">
                    <AlertTriangle className="w-3.5 h-3.5" /> Bu lokasyon için koordinat tanımlı değil; mesafe kontrolü yapılamıyor.
                  </span>
                ) : withinGeofence ? (
                  <span className="inline-flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Lokasyondasın (~{distance != null ? Math.round(distance) : "?"} m, izin {radius} m, doğruluk ±{geo.coords ? Math.round(geo.coords.accuracy) : "?"} m).
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <MapPin className="w-3.5 h-3.5" />
                    Lokasyona uzaktasın (~{distance != null ? Math.round(distance) : "?"} m, izin {radius} m, doğruluk ±{geo.coords ? Math.round(geo.coords.accuracy) : "?"} m).
                  </span>
                )}
              </div>
            )}

            <button
              onClick={() => start.mutate()}
              disabled={
                start.isPending ||
                !propertyId ||
                (hasCoords && (geo.pending || !geo.coords || !withinGeofence))
              }
              className="w-full px-3 py-4 rounded-xl bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" /> Başlat
            </button>
            <p className="text-xs text-muted-foreground text-center">
              <QrCode className="w-3 h-3 inline mr-1" />
              QR kod taradığında lokasyon otomatik seçilir.
            </p>
          </div>
        ) : null}

        {recent.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="text-xs uppercase text-muted-foreground mb-3">Son vardiyalar</div>
            <ul className="space-y-2 text-sm">
              {recent.map((r: any) => {
                const inAt = new Date(r.clock_in_at);
                const outAt = new Date(r.clock_out_at);
                const min = Math.max(0, Math.round((outAt.getTime() - inAt.getTime()) / 60000) - (r.break_minutes ?? 0));
                const h = Math.floor(min / 60);
                const m = min % 60;
                return (
                  <li key={r.id} className="flex justify-between gap-2 border-b border-border last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate">{r.properties?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{inAt.toLocaleString()}</div>
                    </div>
                    <div className="font-mono text-sm">{h}sa {m.toString().padStart(2, "0")}dk</div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function Elapsed({ entry }: { entry: { clock_in_at: string; break_minutes: number; break_started_at: string | null } }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const breakOngoing = entry.break_started_at
    ? Math.round((now - new Date(entry.break_started_at).getTime()) / 60000)
    : 0;
  const breakTotal = (entry.break_minutes ?? 0) + breakOngoing;
  const elapsed = Math.max(0, Math.round((now - new Date(entry.clock_in_at).getTime()) / 60000) - breakTotal);
  const h = Math.floor(elapsed / 60);
  const m = elapsed % 60;
  return (
    <div className="text-center mt-3">
      <div className="text-5xl font-mono font-semibold tabular-nums">{h}sa {m.toString().padStart(2, "0")}dk</div>
      <div className="text-xs text-muted-foreground mt-1">
        Başlangıç {new Date(entry.clock_in_at).toLocaleTimeString()}
        {breakTotal > 0 && <> · Mola {breakTotal}dk</>}
        {entry.break_started_at && <> · <span className="text-warning">Molada</span></>}
      </div>
    </div>
  );
}
