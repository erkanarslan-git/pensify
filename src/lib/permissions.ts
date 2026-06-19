// Central permission catalog. Keys are stable; labels are user-facing (German).
export type AppRole = "owner" | "admin" | "manager" | "reception" | "cleaner";
export const ALL_ROLES: AppRole[] = ["owner", "admin", "manager", "reception", "cleaner"];

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Inhaber",
  admin: "Administrator",
  manager: "Manager",
  reception: "Rezeption",
  cleaner: "Reinigungskraft",
};

export type Permission = { key: string; label: string; group: string; defaultRoles: AppRole[] };

export const PERMISSIONS: Permission[] = [
  { key: "view_calendar", label: "Kalender ansehen", group: "Buchungen", defaultRoles: ["owner", "admin", "manager", "reception", "cleaner"] },
  { key: "create_reservation", label: "Buchungen erstellen / bearbeiten", group: "Buchungen", defaultRoles: ["owner", "admin", "manager", "reception"] },
  { key: "create_past_reservation", label: "Vergangene Buchungen erstellen / bearbeiten", group: "Buchungen", defaultRoles: ["owner", "admin", "manager"] },
  { key: "delete_reservation", label: "Buchungen löschen", group: "Buchungen", defaultRoles: ["owner", "admin"] },
  { key: "manage_rooms", label: "Zimmer & Pensionen verwalten", group: "Stammdaten", defaultRoles: ["owner", "admin"] },
  { key: "assign_cleaning", label: "Reinigung zuweisen", group: "Reinigung", defaultRoles: ["owner", "admin", "manager"] },
  { key: "do_cleaning", label: "Eigene Reinigungsaufträge bearbeiten", group: "Reinigung", defaultRoles: ["owner", "admin", "manager", "cleaner"] },
  { key: "view_finance", label: "Umsatz & Abrechnung ansehen", group: "Finanzen", defaultRoles: ["owner", "admin", "manager"] },
  { key: "pay_cleaners", label: "Lohn freigeben / als bezahlt markieren", group: "Finanzen", defaultRoles: ["owner", "admin"] },
  { key: "manage_team", label: "Team & Rollen verwalten", group: "Administration", defaultRoles: ["owner", "admin"] },
  { key: "manage_settings", label: "Einstellungen ändern", group: "Administration", defaultRoles: ["owner", "admin"] },
  { key: "manage_integrations", label: "Kanal-Integrationen", group: "Administration", defaultRoles: ["owner", "admin"] },
];

// Route → required roles (any-of). Single source of truth for navigation + route guard.
export type RouteAcl = { path: string; roles: AppRole[]; exact?: boolean };
export const ROUTE_ACL: RouteAcl[] = [
  { path: "/", roles: ["owner", "admin", "manager", "reception"], exact: true },
  { path: "/calendar", roles: ["owner", "admin", "manager", "reception"] },
  { path: "/reservations", roles: ["owner", "admin", "manager", "reception"] },
  { path: "/rooms", roles: ["owner", "admin", "manager", "reception"] },
  { path: "/cleaning", roles: ["owner", "admin", "manager", "cleaner"] },
  { path: "/cleaners", roles: ["owner", "admin", "manager"] },
  { path: "/whatsapp", roles: ["owner", "admin", "manager"] },
  { path: "/notifications", roles: ["owner", "admin", "manager", "reception", "cleaner"] },
  { path: "/analytics", roles: ["owner", "admin"] },
  { path: "/properties", roles: ["owner", "admin"] },
  { path: "/time-tracking", roles: ["owner", "admin"] },
  { path: "/team", roles: ["owner", "admin"] },
  { path: "/channel-sync", roles: ["owner", "admin"] },
  { path: "/settings", roles: ["owner", "admin"] },
  { path: "/me", roles: ["owner", "admin", "manager", "reception", "cleaner"] },
  { path: "/clock", roles: ["owner", "admin", "manager", "reception", "cleaner"] },
  { path: "/request-access", roles: ["owner", "admin", "manager", "reception", "cleaner"] }, // any auth user
];

export function routeRolesFor(pathname: string): AppRole[] | null {
  // Longest-prefix match (so /properties/123/qr matches /properties)
  let best: RouteAcl | null = null;
  for (const r of ROUTE_ACL) {
    if (r.exact ? pathname === r.path : pathname === r.path || pathname.startsWith(r.path + "/")) {
      if (!best || r.path.length > best.path.length) best = r;
    }
  }
  return best ? best.roles : null;
}

export function canAccessRoute(pathname: string, roles: AppRole[]): boolean {
  const required = routeRolesFor(pathname);
  if (!required) return false; // unknown route → deny by default
  return required.some((r) => roles.includes(r));
}
