import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  Sparkles,
  Users,
  Bell,
  BarChart3,
  Building2,
  ClipboardList,
  Hotel,
  Clock,
  Shield,
  Settings as SettingsIcon,
  Moon,
  Sun,
  LogOut,
  Globe,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Lock,
  ListTodo,
  Wallet,
  Wrench,
  Monitor,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LockScreen } from "@/components/lock-screen";
import brandLogo from "@/assets/pension-highway-logo.png.asset.json";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { canAccessRoute, roleLabel, type AppRole } from "@/lib/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { labelKey: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    labelKey: "nav.groups.daily",
    items: [
      { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, exact: true },
      { to: "/todos", labelKey: "nav.todos", icon: ListTodo },
      { to: "/notifications", labelKey: "nav.actionCenter", icon: Bell },
      { to: "/me", labelKey: "shift.menu", icon: Clock },
    ],
  },
  {
    labelKey: "nav.groups.stay",
    items: [
      { to: "/reservations", labelKey: "nav.reservations", icon: ClipboardList },
      { to: "/calendar", labelKey: "nav.calendar", icon: CalendarDays },
    ],
  },
  {
    labelKey: "nav.groups.operations",
    items: [
      { to: "/cleaning", labelKey: "nav.cleaning", icon: Sparkles },
      { to: "/maintenance", labelKey: "departments.maintenance", icon: Wrench },
      { to: "/cleaners", labelKey: "departments.personnel", icon: Users },
    ],
  },
  {
    labelKey: "nav.groups.finance",
    items: [
      { to: "/payments", labelKey: "nav.payments", icon: Wallet },
      { to: "/analytics", labelKey: "nav.analytics", icon: BarChart3 },
    ],
  },
  {
    labelKey: "nav.groups.admin",
    items: [
      { to: "/work-report", labelKey: "nav.workReport", icon: BarChart3 },
      { to: "/properties", labelKey: "nav.properties", icon: Building2 },
      { to: "/rooms", labelKey: "nav.rooms", icon: BedDouble },
      { to: "/team", labelKey: "nav.team", icon: Shield },
      { to: "/time-tracking", labelKey: "nav.timeTracking", icon: Clock },
      { to: "/settings", labelKey: "nav.settings", icon: SettingsIcon },
    ],
  },
  {
    labelKey: "nav.groups.tools",
    items: [
      { to: "/ai", labelKey: "nav.aiAssistant", icon: Sparkles },
      { to: "/channel-sync", labelKey: "nav.channelSync", icon: RefreshCw },
      { to: "/displays", labelKey: "tv.displays", icon: Monitor },
    ],
  },
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
  const perms = usePermissions();
  const timeAccess = useQuery({ queryKey: ["time-management-access", perms.userId], enabled: !!perms.userId, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_time_management_access");
    if (error) throw error;
    return data === true;
  } });
  const reportAccess = useQuery({
    queryKey: ["report-access", perms.userId],
    enabled: !!perms.userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_report_teams");
      if (error) throw error;
      return data ?? [];
    },
  });
  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => canAccessRoute(item.to, perms.roles, reportAccess.data ?? [], timeAccess.data === true)) }))
    .filter((g) => g.items.length > 0);
  const primaryRole: AppRole | null = perms.roles.includes("owner")
    ? "owner"
    : perms.roles.includes("admin")
      ? "admin"
      : perms.roles.includes("manager")
        ? "manager"
        : perms.roles.includes("reception")
          ? "reception"
          : perms.roles.includes("cleaner")
            ? "cleaner"
            : null;

  useEffect(() => {
    const stored = localStorage.getItem("pensify.theme");
    if (stored === "dark") setDark(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("pensify.theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("pensify.theme", "light");
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

  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("pensify.locked") === "1") setLocked(true);
  }, []);
  const lock = () => { localStorage.setItem("pensify.locked", "1"); setLocked(true); };
  const unlock = () => { localStorage.removeItem("pensify.locked"); setLocked(false); };
  const lockLabel = { de: "Bildschirm sperren", en: "Lock screen", tr: "Ekranı kilitle" }[
    (i18n.resolvedLanguage ?? "de") as "de" | "en" | "tr"
  ] ?? "Bildschirm sperren";

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("pensify.nav.collapsed") === "1") setCollapsed(true);
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("pensify.nav.collapsed", next ? "1" : "0");
      return next;
    });
  };

  const SidebarContent = ({ onNavigate, mini = false }: { onNavigate?: () => void; mini?: boolean }) => (
    <>
      <div className={`h-16 flex items-center border-b border-sidebar-border ${mini ? "justify-center px-2" : "px-4"}`}>
        {mini ? (
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-soft shrink-0">
            <Hotel className="w-4 h-4" />
          </div>
        ) : (
          <div className="rounded-lg bg-[color:var(--brand-cream)] px-2 py-1.5 shadow-soft">
            <img src={brandLogo.url} alt="Pension Highway" className="h-8 w-auto" />
          </div>
        )}
      </div>
      <nav className={`flex-1 py-3 overflow-y-auto ${mini ? "px-2 space-y-2" : "px-3 space-y-4"}`}>

        {visibleGroups.map((group, gi) => (
          <div key={group.labelKey} className="space-y-0.5">
            {!mini ? (
              <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                {t(group.labelKey)}
              </div>
            ) : gi > 0 ? (
              <div className="mx-2 my-1 border-t border-sidebar-border/60" />
            ) : null}
            {group.items.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  title={mini ? t(item.labelKey) : undefined}
                  className={`flex items-center rounded-xl text-sm transition-all ${
                    mini ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                  } ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-soft"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!mini && <span className="truncate">{t(item.labelKey)}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`border-t border-sidebar-border ${mini ? "p-2" : "p-3"}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`w-full flex items-center rounded-xl hover:bg-sidebar-accent/60 transition-colors ${mini ? "justify-center p-1.5" : "gap-3 px-2 py-2"}`}>
              <div className="w-9 h-9 rounded-full bg-accent grid place-items-center text-xs font-semibold text-accent-foreground shrink-0">
                {initials}
              </div>
              {!mini && (
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">{profile?.full_name || profile?.email || "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{primaryRole ? roleLabel(primaryRole, t) : "—"}</div>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="truncate">{profile?.email}</DropdownMenuLabel>
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
    </>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className={`${collapsed ? "w-16" : "w-64"} shrink-0 border-r border-sidebar-border bg-sidebar/80 backdrop-blur-sm hidden md:flex flex-col transition-[width] duration-200`}>
        <SidebarContent mini={collapsed} />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="min-h-14 md:min-h-16 border-b border-border grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 md:px-6 py-2 sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon"
                  className="md:hidden w-10 h-10 rounded-xl border border-border grid place-items-center hover:bg-accent transition-colors"
                  aria-label={t("shift.openMenu")}
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 flex flex-col bg-sidebar">
                <SheetTitle className="sr-only">{t("app.name")}</SheetTitle>
                <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
            <Button variant="outline" size="icon"
              onClick={toggleCollapsed}
              className="hidden md:grid w-10 h-10 rounded-xl border border-border place-items-center hover:bg-accent transition-colors"
              aria-label={t(collapsed ? "shift.expandMenu" : "shift.collapseMenu")}
              title={t(collapsed ? "shift.expandMenu" : "shift.collapseMenu")}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
          </div>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-semibold tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</p>}
          </div>
          <div className="col-span-2 md:col-span-1 flex flex-wrap items-center gap-2 justify-self-end">
            {actions}
            <button
              onClick={lock}
              className="w-10 h-10 rounded-xl border border-border grid place-items-center hover:bg-accent transition-colors shrink-0"
              aria-label={lockLabel}
              title={lockLabel}
            >
              <Lock className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              className="w-10 h-10 rounded-xl border border-border grid place-items-center hover:bg-accent transition-colors shrink-0"
              aria-label={t("common.theme")}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">{children}</div>
      </main>
      {locked && profile?.email && (
        <LockScreen
          name={(profile.full_name || profile.email).split(" ")[0]}
          email={profile.email}
          onUnlock={unlock}
          onSignOut={() => { unlock(); handleSignOut(); }}
        />
      )}
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
  const hero = accent === "primary";
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-2xl p-5 shadow-sm ${hero ? "brand-tile" : "border border-border bg-card"}`}>
      <div className={`text-sm font-medium leading-normal break-words ${hero ? "opacity-80" : "text-muted-foreground"}`}>{label}</div>
      <div className={`text-3xl font-semibold leading-tight tabular-nums break-words ${accent && !hero ? accentClass : ""}`}>
        {value}
      </div>
      {hint && <div className={`text-xs leading-normal break-words ${hero ? "opacity-80" : "text-muted-foreground"}`}>{hint}</div>}
    </div>
  );
}

export function Badge({ tone, children }: {
  tone: "success" | "info" | "warning" | "destructive" | "muted" | "primary";
  children: ReactNode;
}) {
  const map: Record<string, string> = {
    success: "bg-success/15 text-success-foreground dark:text-success border-success/30",
    info: "bg-info/15 text-info-foreground dark:text-info border-info/30",
    warning: "bg-warning/20 text-warning-foreground dark:text-warning border-warning/40",
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
    muted: "bg-muted text-muted-foreground border-border",
    primary: "bg-primary/15 text-primary border-primary/30 dark:text-primary",
  };

  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium border ${map[tone]}`}>
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
