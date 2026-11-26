export interface BookableRoom { id: string; property_id: string; active: boolean; status: string }
export interface RoomStay { id: string; room_id: string; check_in: string; check_out: string; status: string; deleted_at: string | null }

export function canBookRoom(room: BookableRoom, from: string, to: string, stays: RoomStay[], excludeId?: string): boolean {
  if (!room.active || room.status === "maintenance" || !from || to <= from) return false;
  return !stays.some((stay) => stay.id !== excludeId && stay.room_id === room.id && !stay.deleted_at
    && !["cancelled", "no_show"].includes(stay.status) && stay.check_in < to && stay.check_out > from);
}
/** Short German room-type code: EZ (1), DZ (2), 3DZ/4DZ… for larger rooms. */
export function roomTypeCode(capacity: number | null | undefined): string {
  const c = Number(capacity ?? 0);
  if (!Number.isFinite(c) || c <= 0) return "Zimmer";
  return c === 1 ? "EZ" : c === 2 ? "DZ" : `${c}DZ`;
}

export type RoomChoiceState = "free" | "occupied" | "picked" | "blocked";

/** Why a room can or cannot be chosen; "picked" means another line of the same booking already holds it for overlapping dates. */
export function roomChoiceState(room: BookableRoom, from: string, to: string, stays: RoomStay[], picked: { roomId: string; checkIn: string; checkOut: string }[], excludeId?: string): RoomChoiceState {
  if (!room.active || room.status === "maintenance") return "blocked";
  if (picked.some((p) => p.roomId === room.id && p.checkIn < to && p.checkOut > from)) return "picked";
  return canBookRoom(room, from, to, stays, excludeId) ? "free" : "occupied";
}

export const ROOM_CHOICE_LABELS: Record<string, Record<RoomChoiceState | "free_n" | "beds", string>> = {
  de: { free: "frei", occupied: "belegt", picked: "schon gewählt", blocked: "gesperrt", free_n: "{n} frei", beds: "{n} Pers." },
  tr: { free: "müsait", occupied: "dolu", picked: "zaten seçildi", blocked: "kapalı", free_n: "{n} müsait", beds: "{n} kişilik" },
  en: { free: "free", occupied: "occupied", picked: "already chosen", blocked: "blocked", free_n: "{n} free", beds: "{n} pers." },
};
