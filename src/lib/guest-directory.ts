export type GuestEntry = { identity_key: string; customer_type: string; name: string; company: string | null; email: string | null; phone: string | null; vat: string | null; address: string | null; stays: number; last_stay: string; reservations: { id: string; check_in: string; check_out: string; status: string; property_id: string; revenue?: number; paid?: number }[] };
export type GuestDirectory = { total: number; rows: GuestEntry[] };
export function guestIdentity(guest: { id: string; email?: string | null; phone?: string | null; vat?: string | null; company?: boolean }) {
  if (guest.company && guest.vat?.trim()) return `company:${guest.vat.trim().toLowerCase()}`;
  if (guest.email?.trim()) return `email:${guest.email.trim().toLowerCase()}`;
  if (guest.phone?.replace(/[^0-9+]/g, "")) return `phone:${guest.phone.replace(/[^0-9+]/g, "")}`;
  return `reservation:${guest.id}`;
}