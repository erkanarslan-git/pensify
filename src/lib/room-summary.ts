/** Counts operational room states, never reservation rows or cleaning tasks. */
export function summarizeRooms(rooms: { status: string }[]) {
  const count = (...statuses: string[]) => rooms.filter(room => statuses.includes(room.status)).length;
  return {
    total: rooms.length,
    occupied: count("occupied", "checkout_today"),
    available: count("available", "cleaned"),
    cleaningPending: count("cleaning_required"),
    cleaningInProgress: count("cleaning_in_progress"),
    cleaning: count("cleaning_required", "cleaning_in_progress"),
    maintenance: count("maintenance"),
    checkouts: count("checkout_today"),
  };
}