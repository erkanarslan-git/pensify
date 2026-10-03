export type RoomTypeVisual = {
  label: string;
  marker: string;
  surface: string;
  text: string;
  border: string;
};

const visuals: Record<string, RoomTypeVisual> = {
  EZ: {
    label: "Einzelzimmer",
    marker: "bg-info",
    surface: "bg-info/10",
    text: "text-info-foreground",
    border: "border-info/30",
  },
  DZ: {
    label: "Doppelzimmer",
    marker: "bg-success",
    surface: "bg-success/10",
    text: "text-success-foreground",
    border: "border-success/30",
  },
  "3BZ": {
    label: "Dreibettzimmer",
    marker: "bg-warning",
    surface: "bg-warning/15",
    text: "text-warning-foreground",
    border: "border-warning/40",
  },
  "4BZ": {
    label: "Vierbettzimmer",
    marker: "bg-primary",
    surface: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
  },
  FZ: {
    label: "Familienzimmer",
    marker: "bg-primary",
    surface: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
  },
  FEWO: {
    label: "Ferienwohnung",
    marker: "bg-destructive",
    surface: "bg-destructive/10",
    text: "text-destructive",
    border: "border-destructive/30",
  },
};

export function roomTypeBaseCode(code?: string | null) {
  const normalized = (code ?? "").trim().toUpperCase();
  return Object.keys(visuals).find((key) => normalized === key || normalized.startsWith(`${key}-`)) ?? "OTHER";
}

export function roomTypeVisual(code?: string | null): RoomTypeVisual {
  return visuals[roomTypeBaseCode(code)] ?? {
    label: "Zimmertyp",
    marker: "bg-muted-foreground",
    surface: "bg-muted/40",
    text: "text-foreground",
    border: "border-border",
  };
}
