export interface CalendarReservationTone {
  longStay: boolean;
  guestName: string;
}

/** Every open-ended guest uses one stable category color, independent of the name. */
export function calendarReservationColors(reservation: CalendarReservationTone, regular: { bg: string; fg: string }) {
  return reservation.longStay
    ? { bg: "var(--long-stay-surface)", fg: "var(--long-stay-ink)" }
    : regular;
}

export function hasOpenPayment(payment: "paid" | "partial" | "open" | undefined): boolean {
  return payment === "open";
}
