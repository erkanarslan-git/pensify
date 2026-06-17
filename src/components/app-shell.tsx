import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
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
  LogOut,
  Globe,
  Menu,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean };
const navItems: NavItem[] = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/reservations", labelKey: "nav.reservations", icon: ClipboardList },
  { to: "/calendar", labelKey: "nav.calendar", icon: CalendarDays },
  { to: "/rooms", labelKey: "nav.rooms", icon: BedDouble },
  { to: "/cleaning", labelKey: "nav.cleaning", icon: Sparkles },
  { to: "/cleaners", labelKey: "nav.cleaners", icon: Users },
  { to: "/whatsapp", labelKey: "nav.whatsapp", icon: MessageCircle },
  { to: "/notifications", labelKey: "nav.notifications", icon: Bell },
  { to: "/analytics", labelKey: "nav.analytics", icon: BarChart3 },
  { to: "/properties", labelKey: "nav.properties", icon: Building2 },
];

const LANGS = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
];

function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, locale")
        .eq("id", user.id)
        .maybeSingle();
      return { ...data, email: user.email };
    },
  });
}

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dark, setDark] = useState(false);
  const { data: profile } = useProfile();

  useEffect(() => {
    const stored = localStorage.getItem("stayflow.theme");
    if (stored === "dark") setDark(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("stayflow.theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("stayflow.theme", "light");
    }
  }, [dark]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success(t("auth.signOutSuccess"));
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.full_name || profile?.email || "U")
    .split(/[ @]/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r border-sidebar-border bg-sidebar/80 backdrop-blur-sm hidden md:flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-soft">
            <Hotel className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">{t("app.name")}</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">{t("app.tagline")}</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-soft"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sidebar-accent/60 transition-colors">
                <div className="w-9 h-9 rounded-full bg-accent grid place-items-center text-xs font-semibold text-accent-foreground shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">{profile?.full_name || profile?.email || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">Owner</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel>{profile?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-2">
                <Globe className="w-3.5 h-3.5" /> {t("common.language")}
              </DropdownMenuLabel>
              {LANGS.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onClick={() => i18n.changeLanguage(l.code)}
                  className={i18n.resolvedLanguage === l.code ? "bg-accent" : ""}
                >
                  {l.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> {t("common.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 sticky top-0 bg-background/70 backdrop-blur-md z-10">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={() => setDark((d) => !d)}
              className="w-9 h-9 rounded-xl border border-border grid place-items-center hover:bg-accent transition-colors"
              aria-label={t("common.theme")}
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
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
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
    success: "bg-success/15 text-success-foreground border-success/30",
    info: "bg-info/15 text-info-foreground border-info/30",
    warning: "bg-warning/20 text-warning-foreground border-warning/30",
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
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
