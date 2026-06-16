import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Sparkles,
  Users,
  MessageCircle,
  Bell,
  BarChart3,
  Building2,
  ClipboardList,
  Hotel,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/reservations", label: "Reservations", icon: ClipboardList },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/rooms", label: "Rooms", icon: BedDouble },
  { to: "/cleaning", label: "Cleaning", icon: Sparkles },
  { to: "/cleaners", label: "Cleaners", icon: Users },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/properties", label: "Properties", icon: Building2 },
];

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [dark]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar hidden md:flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Hotel className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">StayFlow</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">Hotel Operations</div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-md">
            <div className="w-8 h-8 rounded-full bg-accent grid place-items-center text-xs font-semibold">
              JM
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">Julia Manager</div>
              <div className="text-xs text-muted-foreground truncate">Owner</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 sticky top-0 bg-background/80 backdrop-blur z-10">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={() => setDark((d) => !d)}
              className="w-9 h-9 rounded-md border border-border grid place-items-center hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}

export function Kpi({ label, value, hint, accent }: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "success" | "warning" | "destructive" | "info" | "primary";
}) {
  const accentClass = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    info: "text-info",
    primary: "text-primary",
  }[accent ?? "primary"];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tracking-tight ${accent ? accentClass : ""}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Badge({ tone, children }: {
  tone: "success" | "info" | "warning" | "destructive" | "muted" | "primary";
  children: ReactNode;
}) {
  const map: Record<string, string> = {
    success: "bg-success/10 text-success border-success/20",
    info: "bg-info/10 text-info border-info/20",
    warning: "bg-warning/15 text-warning-foreground border-warning/30",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    muted: "bg-muted text-muted-foreground border-border",
    primary: "bg-primary/10 text-primary border-primary/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
