import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
  Store,
  Search,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState, useRef, type ReactNode } from "react";
import brandLogo from "@/assets/pension-highway-logo.png";
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
      { to: "/guests", labelKey: "guests.title", icon: Users },
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
      { to: "/overnights", labelKey: "nav.overnights", icon: BedDouble },
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
    labelKey: "nav.groups.channels",
    items: [
      { to: "/sales-channels", labelKey: "salesChannels.title", icon: Store },
      { to: "/channel-sync", labelKey: "nav.channelSync", icon: RefreshCw },
    ],
  },
  {
    labelKey: "nav.groups.tools",
    items: [
      { to: "/ai", labelKey: "nav.aiAssistant", icon: Sparkles },
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

// The v2 design is permanent; kept as a hook so pages keep their call sites.
export function useV2Theme() {
  return true;
}

export function AppShell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const [dark, setDark] = useState(false);
  const v2 = true;
  const navigate = useNavigate();
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
    .map((g) => ({ ...g, items: g.items.filter((item) => canAccessRoute(item.to, perms.roles, reportAccess.data ?? [], timeAccess.data === true, perms.can)) }))
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

  // v2 is now the permanent design.
  useEffect(() => {
    document.documentElement.classList.add("theme-v2");
    localStorage.setItem("pensify.themeV2", "1");
    window.dispatchEvent(new Event("pensify-theme-v2"));
  }, []);
  const lang = (i18n.resolvedLanguage ?? "de") as "de" | "en" | "tr";
  const searchLabel = { de: "Seite suchen…", en: "Search pages…", tr: "Sayfa ara…" }[lang] ?? "Seite suchen…";

  // Cover the panel at once, end the session, then replace the page with login
  // (full replace: no panel flash, cached data gone, Back cannot return).
  const [locked, setLocked] = useState(false);
  async function handleSignOut() {
    setLocked(true);
    localStorage.removeItem("pensify.locked");
    await queryClient.cancelQueries();
    queryClient.clear();
    try { await supabase.auth.signOut(); } catch { await supabase.auth.signOut({ scope: "local" }); }
    window.location.replace("/auth");
  }

  const initials = (profile?.full_name || profile?.email || "U")
    .split(/[ @]/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const lock = () => { void handleSignOut(); };
  const lockLabel = { de: "Bildschirm sperren", en: "Lock screen", tr: "Ekranı kilitle" }[
    (i18n.resolvedLanguage ?? "de") as "de" | "en" | "tr"
  ] ?? "Bildschirm sperren";

  // Quick page search: on focus shows frequent pages + all menu groups; typing filters.
  const [pageQuery, setPageQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const allNavItems = visibleGroups.flatMap((g) => g.items);
  const frequentPaths = ["/calendar", "/reservations", "/cleaning", "/maintenance", "/todos", "/"];
  const frequentItems = frequentPaths
    .map((p) => allNavItems.find((i) => i.to === p))
    .filter((i): i is NavItem => !!i);
  const q = pageQuery.trim().toLocaleLowerCase();
  const pageMatches = q
    ? allNavItems.filter((i) => t(i.labelKey).toLocaleLowerCase().includes(q))
    : [];
  const searchSections: { label: string; items: NavItem[] }[] = q
    ? [{ label: "", items: pageMatches }]
    : [
        { label: ({ de: "Häufig genutzt", en: "Frequently used", tr: "Sık kullanılanlar" } as Record<string, string>)[lang] ?? "Häufig genutzt", items: frequentItems },
        ...visibleGroups.map((g) => ({ label: t(g.labelKey), items: g.items.filter((i) => !frequentPaths.includes(i.to)) })).filter((s) => s.items.length > 0),
      ];
  const flatResults = searchSections.flatMap((s) => s.items);
  const canSeeNotifications = allNavItems.some((i) => i.to === "/notifications");
  // Overdue installments (due today or earlier, not fully paid) for the red Buchhaltung badge.
  const canSeePayments = allNavItems.some((i) => i.to === "/payments");
  const { data: duePayments = 0 } = useQuery({
    queryKey: ["nav-due-payments", profile?.id ?? null],
    enabled: canSeePayments,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
      const { data: due, error } = await supabase.from("payment_schedules").select("id,amount").lte("due_date", today).limit(1000);
      if (error || !due?.length) return 0;
      const ids = due.map((d) => d.id);
      const { data: paid } = await supabase.from("payments").select("schedule_id,amount").in("schedule_id", ids).is("reversed_at", null);
      const sums = new Map<string, number>();
      for (const p of paid ?? []) if (p.schedule_id) sums.set(p.schedule_id, (sums.get(p.schedule_id) ?? 0) + Number(p.amount));
      return due.filter((d) => (sums.get(d.id) ?? 0) < Number(d.amount)).length;
    },
  });
  // Red badges: cleaning tasks due by today (Berlin) and open maintenance issues, RLS-scoped.
  const canSeeCleaning = allNavItems.some((i) => i.to === "/cleaning");
  const { data: cleaningSplit = { ready: 0, leaving: 0 } } = useQuery({
    queryKey: ["nav-due-cleaning", profile?.id ?? null],
    enabled: canSeeCleaning,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" });
      const today = fmt.format(new Date());
      const [{ data, error }, { data: outs }] = await Promise.all([
        supabase.from("cleaning_tasks").select("room_id,due_at").in("status", ["pending", "accepted", "in_progress", "problem"]).limit(2000),
        supabase.from("reservations").select("room_id").eq("check_out", today).is("deleted_at", null).in("status", ["confirmed", "checked_in", "tentative"]),
      ]);
      if (error || !data) return { ready: 0, leaving: 0 };
      const rooms = new Set(data.filter((d) => !d.due_at || fmt.format(new Date(d.due_at)) <= today).map((d) => d.room_id));
      const leavingSet = new Set((outs ?? []).map((r) => r.room_id));
      let leaving = 0;
      rooms.forEach((r) => { if (leavingSet.has(r)) leaving++; });
      return { ready: rooms.size - leaving, leaving };
    },
  });
  const dueCleaning = cleaningSplit.ready + cleaningSplit.leaving;
  const canSeeMaintenance = allNavItems.some((i) => i.to === "/maintenance");
  const { data: openIssues = 0 } = useQuery({
    queryKey: ["nav-open-issues", profile?.id ?? null],
    enabled: canSeeMaintenance,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("maintenance_board");
      if (error || !data) return 0;
      return ((data as unknown as { issues?: unknown[] }).issues ?? []).length;
    },
  });
  const navBadge = (to: string) => to === "/payments" ? duePayments : to === "/cleaning" ? dueCleaning : to === "/maintenance" ? openIssues : 0;
  const goToPage = (to: string) => { setPageQuery(""); setSearchOpen(false); navigate({ to: to as never }); };
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
          <div className="sidebar-logo rounded-lg bg-[color:var(--brand-cream)] px-2 py-1.5 shadow-soft">
            <img src={brandLogo} alt="Pension Highway" className="h-8 w-auto" />
          </div>
        )}
      </div>
      <nav className={`flex-1 py-3 overflow-y-auto ${mini ? "px-2 space-y-2" : "px-3 space-y-4"}`}>

        {visibleGroups.map((group, gi) => (
          <div key={group.labelKey} className="space-y-0.5">
            {!mini ? (
              <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/60 font-semibold">
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
                  <span className="relative shrink-0">
                    <Icon className="w-4 h-4" />
                    {mini && navBadge(item.to) > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-destructive" />
                    )}
                  </span>
                  {!mini && <span className="truncate flex-1">{t(item.labelKey)}</span>}
                  {!mini && item.to === "/cleaning" && dueCleaning > 0 ? (
                    <span className="ml-auto flex items-center gap-1" title={t("cleaning.badgeHint", { ready: cleaningSplit.ready, leaving: cleaningSplit.leaving })}>
                      {cleaningSplit.ready > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold grid place-items-center">{cleaningSplit.ready}</span>}
                      {cleaningSplit.leaving > 0 && <span className="h-5 px-1.5 rounded-full bg-warning/20 text-warning text-[11px] font-semibold grid place-items-center">+{cleaningSplit.leaving}</span>}
                    </span>
                  ) : !mini && navBadge(item.to) > 0 && (
                    <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold grid place-items-center">
                      {navBadge(item.to) > 99 ? "99+" : navBadge(item.to)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {!v2 && (
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
                  <div className="text-xs text-sidebar-foreground/60 truncate">{primaryRole ? roleLabel(primaryRole, t) : "—"}</div>
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
      )}
    </>
  );

  const searchBox = (wide: boolean) => {
    let idx = -1;
    return (
    <div className={`relative ${wide ? "w-full" : "hidden lg:block"}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={wide ? searchInputRef : undefined}
        value={pageQuery}
        onChange={(e) => { setPageQuery(e.target.value); setActiveIdx(0); setSearchOpen(true); }}
        onFocus={() => { setSearchOpen(true); setActiveIdx(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flatResults.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" && flatResults[activeIdx]) goToPage(flatResults[activeIdx].to);
          if (e.key === "Escape") { setPageQuery(""); setSearchOpen(false); (e.target as HTMLInputElement).blur(); }
        }}
        onBlur={() => setTimeout(() => { setPageQuery(""); setSearchOpen(false); }, 150)}
        placeholder={searchLabel}
        className={`h-10 rounded-full border border-border bg-background pl-9 pr-14 text-sm outline-none focus:ring-2 focus:ring-ring/25 ${wide ? "w-full" : "w-52 rounded-xl"}`}
      />
      {wide && (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:block">Ctrl K</kbd>
      )}
      {searchOpen && (
        <div className="absolute left-0 top-12 z-30 max-h-72 w-full overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-elevated">
          {flatResults.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {({ de: "Keine Seite gefunden", en: "No page found", tr: "Sayfa bulunamadı" } as Record<string, string>)[lang] ?? "Keine Seite gefunden"}
            </p>
          )}
          {searchSections.map((section) => (
            <div key={section.label || "results"} className="py-1">
              {section.label && (
                <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</p>
              )}
              {section.items.map((item) => {
                idx += 1;
                const my = idx;
                return (
                  <button
                    key={section.label + item.to}
                    onMouseDown={(e) => { e.preventDefault(); goToPage(item.to); }}
                    onMouseEnter={() => setActiveIdx(my)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${activeIdx === my ? "bg-accent text-accent-foreground" : ""}`}
                  >
                    <item.icon className="h-4 w-4 text-muted-foreground" /> {t(item.labelKey)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
    );
  };

  const headerButtons = (
    <>
      {canSeeNotifications && (
        <Link
          to="/notifications"
          className="w-10 h-10 rounded-xl border border-border grid place-items-center hover:bg-accent transition-colors shrink-0"
          aria-label={t("nav.actionCenter")}
          title={t("nav.actionCenter")}
        >
          <Bell className="w-4 h-4" />
        </Link>
      )}
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
    </>
  );

  const menuButtons = (
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
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className={`${collapsed ? "w-16" : "w-64"} shrink-0 border-r border-sidebar-border ${v2 ? "bg-sidebar" : "bg-sidebar/80 backdrop-blur-sm"} hidden md:flex flex-col transition-[width] duration-200`}>
        <SidebarContent mini={collapsed} />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {v2 ? (
          <header className="min-h-14 md:min-h-16 border-b border-border flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 sticky top-0 bg-background/80 backdrop-blur-md z-10">
            {menuButtons}
            <div className="flex-1 max-w-xl hidden sm:block">{searchBox(true)}</div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {headerButtons}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 hover:bg-accent transition-colors shrink-0">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials}</span>
                    <span className="hidden max-w-32 truncate text-sm font-medium lg:block">{profile?.full_name || profile?.email || "—"}</span>
                    <ChevronDown className="hidden h-4 w-4 text-muted-foreground lg:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
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
          </header>
        ) : (
          <header className="min-h-14 md:min-h-16 border-b border-border grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 md:px-6 py-2 sticky top-0 bg-background/80 backdrop-blur-md z-10">
            {menuButtons}
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-semibold tracking-tight truncate">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</p>}
            </div>
            <div className="col-span-2 md:col-span-1 flex flex-wrap items-center gap-2 justify-self-end">
              {searchBox(false)}
              {headerButtons}
            </div>
          </header>
        )}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          {v2 && pathname !== "/" && title && (
            <div className="mb-5 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </main>
      {locked && <div className="fixed inset-0 z-[100] bg-background" aria-hidden="true" />}
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
    <section className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}
