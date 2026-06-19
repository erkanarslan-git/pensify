// Central permission catalog. Keys are stable; labels are user-facing (German).
export type AppRole = "owner" | "admin" | "manager" | "cleaner";
export const ALL_ROLES: AppRole[] = ["owner", "admin", "manager", "cleaner"];

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Inhaber",
  admin: "Administrator",
  manager: "Manager",
  cleaner: "Reinigungskraft",
};

export type Permission = { key: string; label: string; group: string; defaultRoles: AppRole[] };

export const PERMISSIONS: Permission[] = [
  { key: "view_calendar", label: "Kalender ansehen", group: "Buchungen", defaultRoles: ["owner", "admin", "manager", "cleaner"] },
  { key: "create_reservation", label: "Buchungen erstellen / bearbeiten", group: "Buchungen", defaultRoles: ["owner", "admin", "manager"] },
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
