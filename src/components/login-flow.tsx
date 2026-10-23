import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { BedDouble, CalendarCheck, Globe, Pause, Play, ShieldCheck, Smile, Sparkles } from "lucide-react";

type Copy = { eyebrow: string; title: string; sub: string; res: string; room: string; roomSub: string; guests: string; guestsSub: string; direct: string; web: string; caption: string; team: string };

const SOURCES = [
  { key: "booking", label: "Booking.com", badge: "B.", tone: "oklch(0.5 0.17 258)" },
  { key: "airbnb", label: "Airbnb", badge: "a", tone: "oklch(0.55 0.15 15)" },
  { key: "check24", label: "CHECK24", badge: "24", tone: "oklch(0.48 0.14 255)" },
  { key: "expedia", label: "Expedia", badge: "E", tone: "oklch(0.5 0.1 85)" },
  { key: "direct", label: "", badge: "cal", tone: "oklch(0.45 0.08 255)" },
  { key: "web", label: "", badge: "web", tone: "oklch(0.5 0.1 170)" },
];

// SVG coordinate space: 600 x 380. Source cards sit at x 0–170, hub center (300,180).
const ROW_Y = [30, 90, 150, 210, 270, 330];
const HUB = { x: 300, y: 180 };

export function LoginFlow({ c }: { c: Copy }) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (paused) svg.pauseAnimations(); else svg.unpauseAnimations();
  }, [paused]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % SOURCES.length), 1600);
    return () => clearInterval(id);
  }, [paused]);

  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="flex h-full flex-col">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-75">{c.eyebrow}</div>
      <h2 className="mt-5 max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">{c.title}</h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed opacity-80">{c.sub}</p>

      <div className="relative mt-10 w-full max-w-[600px]" style={{ aspectRatio: "600 / 380" }}>
        <svg ref={svgRef} viewBox="0 0 600 380" className="absolute inset-0 h-full w-full" aria-hidden>
          {ROW_Y.map((y, i) => {
            const d = `M170 ${y} C 230 ${y}, 230 ${HUB.y}, ${HUB.x - 45} ${HUB.y}`;
            return (
              <g key={i}>
                <path id={`flow-${i}`} d={d} fill="none" stroke="oklch(0.85 0.06 250)" strokeOpacity={active === i ? 0.7 : 0.22} strokeWidth="1.5" style={{ transition: "stroke-opacity .4s" }} />
                {!reduce && (
                  <circle r="3.5" fill="oklch(0.92 0.06 250)">
                    <animateMotion dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                      <mpath href={`#flow-${i}`} />
                    </animateMotion>
                    <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
          <path id="flow-room" d={`M${HUB.x + 45} ${HUB.y} L 455 ${HUB.y}`} stroke="oklch(0.85 0.06 250)" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
          <path id="flow-guest" d="M 520 215 L 520 285 L 470 285" stroke="oklch(0.85 0.06 250)" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
          {!reduce && ["flow-room", "flow-guest"].map((id, i) => (
            <circle key={id} r="3.5" fill="oklch(0.92 0.06 250)">
              <animateMotion dur="1.8s" begin={`${0.9 + i * 0.9}s`} repeatCount="indefinite"><mpath href={`#${id}`} /></animateMotion>
              <animate attributeName="opacity" values="0;1;1;0" dur="1.8s" begin={`${0.9 + i * 0.9}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>

        {/* Source cards */}
        {SOURCES.map((s, i) => (
          <div key={s.key}
            className="absolute left-0 flex w-[28.5%] items-center gap-2.5 rounded-xl border px-3 py-2 backdrop-blur-sm transition-all duration-500"
            style={{
              top: `${((ROW_Y[i] - 22) / 380) * 100}%`, height: `${(44 / 380) * 100}%`,
              background: "oklch(0.3 0.08 258 / 0.6)",
              borderColor: active === i ? "oklch(0.85 0.06 250 / 0.7)" : "oklch(0.85 0.06 250 / 0.18)",
              transform: active === i ? "translateX(4px)" : "none",
            }}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold" style={{ background: s.tone }}>
              {s.badge === "cal" ? <CalendarCheck className="h-3.5 w-3.5" /> : s.badge === "web" ? <Globe className="h-3.5 w-3.5" /> : s.badge}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold">{s.label || (s.key === "direct" ? c.direct : c.web)}</span>
              <span className="block truncate text-[10px] opacity-70">{c.res}</span>
            </span>
          </div>
        ))}

        {/* Hub */}
        <div className="absolute grid place-items-center rounded-2xl shadow-2xl"
          style={{ left: `${((HUB.x - 45) / 600) * 100}%`, top: `${((HUB.y - 45) / 380) * 100}%`, width: `${(90 / 600) * 100}%`, aspectRatio: "1",
            background: "linear-gradient(150deg, oklch(0.98 0.01 250), oklch(0.86 0.07 252))", color: "oklch(0.3 0.1 260)" }}>
          {!reduce && !paused && <span className="absolute inset-0 animate-ping rounded-2xl bg-[oklch(0.85_0.08_250/0.25)] [animation-duration:2.4s]" />}
          <div className="relative flex flex-col items-center">
            <BedDouble className="h-6 w-6" />
            <span className="mt-1 text-sm font-bold tracking-wider">PHW</span>
          </div>
        </div>

        {/* Room ready */}
        <div className="absolute flex flex-col items-center justify-center rounded-xl border text-center"
          style={{ left: `${(455 / 600) * 100}%`, top: `${(145 / 380) * 100}%`, width: `${(130 / 600) * 100}%`, height: `${(70 / 380) * 100}%`, background: "oklch(0.3 0.08 258 / 0.6)", borderColor: "oklch(0.85 0.06 250 / 0.25)" }}>
          <Sparkles className="h-4 w-4 opacity-90" />
          <span className="mt-1 text-xs font-semibold">{c.room}</span>
          <span className="text-[10px] opacity-70">{c.roomSub}</span>
        </div>

        {/* Happy guests */}
        <div className="absolute flex items-center gap-3 rounded-xl border px-4"
          style={{ left: `${(215 / 600) * 100}%`, top: `${(255 / 380) * 100}%`, width: `${(255 / 600) * 100}%`, height: `${(62 / 380) * 100}%`, background: "oklch(0.3 0.08 258 / 0.6)", borderColor: "oklch(0.85 0.06 250 / 0.25)" }}>
          <Smile className="h-5 w-5 shrink-0" />
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{c.guests}</span>
            <span className="block text-[10px] opacity-70">{c.guestsSub}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex max-w-[600px] items-center justify-between">
        <span className="text-[11px] opacity-60">{c.caption}</span>
        <button onClick={() => setPaused((p) => !p)} aria-label={paused ? t("legacyUi.play") : t("legacyUi.pause")}
          className="grid h-9 w-9 place-items-center rounded-full border border-[oklch(0.85_0.06_250/0.3)] hover:bg-[oklch(1_0_0/0.08)]">
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-8 text-xs opacity-80">
        <ShieldCheck className="h-4 w-4" /> {c.team}
      </div>
    </div>
  );
}
