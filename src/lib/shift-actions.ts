export type ShiftAction = "start" | "break" | "resume" | "finish";

export interface OpenShiftLite {
  property_id: string;
  break_started_at: string | null;
}

/**
 * Actions an employee may take on the clock screen.
 * - no open shift → start
 * - working → break, finish
 * - on break → resume, finish
 * - open shift at another location → nothing (finish there first)
 */
export function shiftActions(open: OpenShiftLite | null | undefined, propertyId: string | null): ShiftAction[] {
  if (!open) return propertyId ? ["start"] : [];
  if (propertyId && open.property_id !== propertyId) return [];
  return open.break_started_at ? ["resume", "finish"] : ["break", "finish"];
}

export type ShiftState = "idle" | "working" | "on_break" | "elsewhere";

export function shiftState(open: OpenShiftLite | null | undefined, propertyId: string | null): ShiftState {
  if (!open) return "idle";
  if (propertyId && open.property_id !== propertyId) return "elsewhere";
  return open.break_started_at ? "on_break" : "working";
}

/** One-shot position read at action time (no continuous tracking). */
export function readPositionOnce(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("location_required"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error("location_required")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}
