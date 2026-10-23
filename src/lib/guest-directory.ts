export type GuestEntry = { identity_key: string; customer_type: string; name: string; company: string | null; email: string | null; phone: string | null; vat: string | null; address: string | null; stays: number; last_stay: string; reservations: { id: string; check_in: string; check_out: string; status: string; property_id: string; revenue?: number; paid?: number }[] };
export type GuestDirectory = { total: number; rows: GuestEntry[] };
export function guestIdentity(guest: { id: string; bookingId?: string | null }) {
  return guest.bookingId ? `booking:${guest.bookingId}` : `reservation:${guest.id}`;
}
