export interface BookableRoom { id: string; property_id: string; active: boolean; status: string }
export interface RoomStay { id: string; room_id: string; check_in: string; check_out: string; status: string; deleted_at: string | null }

export function canBookRoom(room: BookableRoom, from: string, to: string, stays: RoomStay[], excludeId?: string): boolean {
  if (!room.active || room.status === "maintenance" || !from || to <= from) return false;
  return !stays.some((stay) => stay.id !== excludeId && stay.room_id === room.id && !stay.deleted_at
    && !["cancelled", "no_show"].includes(stay.status) && stay.check_in < to && stay.check_out > from);
}