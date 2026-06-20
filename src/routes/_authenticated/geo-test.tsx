import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/geo-test")({
  head: () => ({ meta: [{ title: "Geofence Test — Pensify" }] }),
  component: GeoTestPage,
});

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type Reading = { lat: number; lng: number; accuracy: number; ts: number };

function useGeoWatch() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Konum API desteklenmiyor");
      setPending(false);
      return;
    }
    setPending(true);
    setError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setReading({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: pos.timestamp,
        });
        setPending(false);
      },
      (err) => {
        setError(err.message);
        setPending(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [nonce]);
  return { reading, error, pending, refresh: () => setNonce((n) => n + 1) };
}

type PropertyLite = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
};

function GeoTestPage() {
  const geo = useGeoWatch();
  const [selectedId, setSelectedId] = useState<string>("");

  const q = useQuery({
    queryKey: ["geo-test-properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, latitude, longitude, geofence_radius_m")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PropertyLite[];
    },
  });

  const rows = useMemo(() => {
    const list = q.data ?? [];
    return list.map((p) => {
      const hasCoords = p.latitude != null && p.longitude != null;
      const radius = p.geofence_radius_m ?? 150;
      const dist = hasCoords && geo.reading
        ? distanceM(geo.reading.lat, geo.reading.lng, p.latitude!, p.longitude!)
        : null;
      const acc = geo.reading?.accuracy ?? 0;
      const accBuffer = Math.min(acc, 500);
      const effective = dist != null ? Math.max(0, dist - accBuffer) : null;
      // Intersection: circles overlap iff dist <= radius + accuracy
      const intersects = dist != null ? dist <= radius + acc : false;
      // Fully inside the geofence (no doubt)
      const fullyInside = dist != null ? dist + acc <= radius : false;
      const accepted = !hasCoords ? null : effective != null && effective <= radius;
      return { p, hasCoords, radius, dist, acc, effective, intersects, fullyInside, accepted };
    });
  }, [q.data, geo.reading]);

  const selected = rows.find((r) => r.p.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-background/80 backdrop-blur sticky top-0">
        <div className="font-semibold tracking-tight">Geofence Test</div>
        <button
          onClick={geo.refresh}
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-accent"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Yenile
        </button>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Current position */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="text-xs uppercase text-muted-foreground mb-2">Mevcut konum</div>
          {geo.pending ? (
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Konum alınıyor…
            </div>
          ) : geo.error ? (
            <div className="inline-flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4" /> {geo.error}
            </div>
          ) : geo.reading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Enlem" value={geo.reading.lat.toFixed(6)} />
              <Stat label="Boylam" value={geo.reading.lng.toFixed(6)} />
              <Stat
                label="Doğruluk"
                value={`±${Math.round(geo.reading.accuracy)} m`}
                tone={geo.reading.accuracy <= 50 ? "ok" : geo.reading.accuracy <= 200 ? "warn" : "bad"}
              />
              <Stat label="Zaman" value={new Date(geo.reading.ts).toLocaleTimeString()} />
            </div>
          ) : null}
          {geo.reading && (
            <div className="text-xs text-muted-foreground mt-3">
              Kabul kuralı: <code>mesafe − min(doğruluk, 500m) ≤ geofence yarıçapı</code>
            </div>
          )}
        </section>

        {/* Property list */}
        <section className="rounded-2xl border border-border bg-card shadow-soft overflow-hidden">
          <div className="px-5 pt-5 pb-3 text-xs uppercase text-muted-foreground">
            Lokasyonlar ({rows.length})
          </div>
          {q.isLoading ? (
            <div className="p-5 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Lokasyon yok.</div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.p.id}>
                  <button
                    onClick={() => setSelectedId(r.p.id === selectedId ? "" : r.p.id)}
                    className={`w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-accent/50 ${selectedId === r.p.id ? "bg-accent/40" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {!r.hasCoords ? (
                          "Koordinat tanımlı değil"
                        ) : r.dist == null ? (
                          `Yarıçap ${r.radius} m`
                        ) : (
                          <>
                            Mesafe <b className="font-mono">{Math.round(r.dist)} m</b> · Yarıçap{" "}
                            {r.radius} m · Etkin{" "}
                            <span className="font-mono">{Math.round(r.effective ?? 0)} m</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {r.accepted === null ? (
                        <Badge tone="warn" icon={<AlertTriangle className="w-3 h-3" />}>
                          Koord. yok
                        </Badge>
                      ) : r.accepted ? (
                        r.fullyInside ? (
                          <Badge tone="ok" icon={<CheckCircle2 className="w-3 h-3" />}>
                            İçeride
                          </Badge>
                        ) : (
                          <Badge tone="ok" icon={<CheckCircle2 className="w-3 h-3" />}>
                            Kesişim (kabul)
                          </Badge>
                        )
                      ) : r.intersects ? (
                        <Badge tone="warn" icon={<AlertTriangle className="w-3 h-3" />}>
                          Sınırda (red)
                        </Badge>
                      ) : (
                        <Badge tone="bad" icon={<XCircle className="w-3 h-3" />}>
                          Uzak
                        </Badge>
                      )}
                    </div>
                  </button>
                  {selectedId === r.p.id && (
                    <div className="px-5 pb-5">
                      <Diagram
                        distance={r.dist}
                        radius={r.radius}
                        accuracy={r.acc}
                        hasCoords={r.hasCoords}
                      />
                      <Details row={r} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-muted-foreground text-center">
          Mavi = senin doğruluk çemberin · Yeşil = lokasyonun geofence çemberi
        </p>
        {selected && null}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color =
    tone === "ok"
      ? "text-success"
      : tone === "warn"
        ? "text-warning"
        : tone === "bad"
          ? "text-destructive"
          : "";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm ${color}`}>{value}</div>
    </div>
  );
}

function Badge({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "warn" | "bad";
  icon: ReactNode;
  children: ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "bg-success/10 text-success border-success/30"
      : tone === "warn"
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${cls}`}>
      {icon}
      {children}
    </span>
  );
}

function Diagram({
  distance,
  radius,
  accuracy,
  hasCoords,
}: {
  distance: number | null;
  radius: number;
  accuracy: number;
  hasCoords: boolean;
}) {
  if (!hasCoords) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground my-4">
        Bu lokasyon için koordinat tanımlı değil — kesişim çizilemiyor.
      </div>
    );
  }
  if (distance == null) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground my-4">
        Konum henüz alınmadı.
      </div>
    );
  }
  // Choose a scale so both circles fit
  const span = Math.max(radius + accuracy, distance) * 2.2;
  const W = 320;
  const H = 220;
  const scale = Math.min(W, H) / span; // px per meter
  const cx = W / 2;
  const cy = H / 2;
  // Place geofence at center; user offset by distance to the right
  const userX = cx + distance * scale;
  const userY = cy;
  const rGeo = Math.max(2, radius * scale);
  const rAcc = Math.max(2, accuracy * scale);

  return (
    <div className="my-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto border border-border rounded-xl bg-muted/20"
      >
        {/* Geofence */}
        <circle cx={cx} cy={cy} r={rGeo} fill="hsl(var(--success) / 0.15)" stroke="hsl(var(--success))" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="3" fill="hsl(var(--success))" />
        <text x={cx + 6} y={cy - 6} className="text-[10px]" fill="currentColor">
          Lokasyon
        </text>

        {/* Accuracy circle */}
        <circle
          cx={userX}
          cy={userY}
          r={rAcc}
          fill="hsl(var(--primary) / 0.15)"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <circle cx={userX} cy={userY} r="3" fill="hsl(var(--primary))" />
        <text x={userX + 6} y={userY - 6} className="text-[10px]" fill="currentColor">
          Sen
        </text>

        {/* Distance line */}
        <line
          x1={cx}
          y1={cy}
          x2={userX}
          y2={userY}
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeDasharray="2 3"
        />
        <text
          x={(cx + userX) / 2}
          y={cy + 14}
          textAnchor="middle"
          className="text-[10px] font-mono"
          fill="currentColor"
        >
          {Math.round(distance)} m
        </text>
      </svg>
    </div>
  );
}

function Details({
  row,
}: {
  row: {
    p: PropertyLite;
    radius: number;
    dist: number | null;
    acc: number;
    effective: number | null;
    intersects: boolean;
    fullyInside: boolean;
    accepted: boolean | null;
  };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
      <Stat label="Lokasyon enlem" value={row.p.latitude?.toFixed(6) ?? "—"} />
      <Stat label="Lokasyon boylam" value={row.p.longitude?.toFixed(6) ?? "—"} />
      <Stat label="Yarıçap" value={`${row.radius} m`} />
      <Stat label="Mesafe" value={row.dist != null ? `${Math.round(row.dist)} m` : "—"} />
      <Stat label="Doğruluk" value={`±${Math.round(row.acc)} m`} />
      <Stat
        label="Etkin mesafe"
        value={row.effective != null ? `${Math.round(row.effective)} m` : "—"}
      />
      <Stat label="Kesişim?" value={row.intersects ? "Evet" : "Hayır"} />
      <Stat label="Tamamen içeride?" value={row.fullyInside ? "Evet" : "Hayır"} />
      <Stat
        label="Sonuç"
        value={row.accepted === null ? "—" : row.accepted ? "Kabul" : "Red"}
        tone={row.accepted === null ? "warn" : row.accepted ? "ok" : "bad"}
      />
    </div>
  );
}
