export interface CalendarReservationTone {
  longStay: boolean;
  guestName: string;
  status?: string;
}

/** Colors carry meaning only: long stay, in house, finished, otherwise booked. Never derived from the name. */
export function calendarReservationColors(reservation: CalendarReservationTone) {
  if (reservation.longStay) return { bg: "var(--long-stay-surface)", fg: "var(--long-stay-ink)" };
  if (reservation.status === "checked_in") return { bg: "var(--stay-inhouse-surface)", fg: "var(--stay-inhouse-ink)" };
  if (reservation.status === "checked_out") return { bg: "var(--stay-done-surface)", fg: "var(--stay-done-ink)" };
  return { bg: "var(--stay-booked-surface)", fg: "var(--stay-booked-ink)" };
}

export function hasOpenPayment(payment: "paid" | "partial" | "open" | undefined): boolean {
  return payment === "open";
}
