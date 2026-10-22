// Provider-independent matching of incoming bank transactions to open installments.
// Money is handled in integer cents to avoid float drift.

export interface BankTx {
  amount: number; // signed, major units (incoming > 0)
  currency: string;
  bookingStatus: "booked" | "pending";
  remittance: string | null;
  counterpartyIban: string | null;
}

export interface OpenInstallment {
  id: string;
  reservationId: string;
  reference: string; // e.g. PH-AB12CD
  remaining: number; // major units, > 0
  currency: string;
  kind: "rent" | "deposit" | "other";
  payerIbans: string[];
}

export type MatchDecision =
  | { kind: "auto"; allocations: { scheduleId: string; amount: number }[]; unallocated: number }
  | { kind: "review"; reason: ReviewReason; candidateIds: string[] }
  | { kind: "none" };

export type ReviewReason = "pending" | "outgoing" | "currency" | "deposit" | "multiple" | "amount_mismatch" | "no_reference";

const cents = (n: number) => Math.round(n * 100);
const major = (c: number) => c / 100;
export const normalizeIban = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();
export const maskIban = (s: string | null | undefined) => {
  const v = normalizeIban(s);
  return v.length > 8 ? `${v.slice(0, 4)} •••• ${v.slice(-4)}` : v ? "••••" : "";
};

/** Finds payment references like "PH-AB12CD" even when written as "ph ab12cd" or "PHAB12CD". */
export function extractReferences(text: string | null): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/PH[\s\-_.]?([A-Z0-9]{6})(?![A-Z0-9])/g)) out.add(`PH-${m[1]}`);
  return [...out];
}

export function decideMatch(tx: BankTx, open: OpenInstallment[]): MatchDecision {
  if (tx.bookingStatus !== "booked") return { kind: "none" }; // pending never settles anything
  if (tx.amount <= 0) return { kind: "review", reason: "outgoing", candidateIds: [] };

  const refs = extractReferences(tx.remittance);
  const byRef = open.filter((i) => refs.includes(i.reference.toUpperCase()));

  if (byRef.length > 0) {
    if (byRef.some((i) => i.currency !== tx.currency)) return { kind: "review", reason: "currency", candidateIds: byRef.map((i) => i.id) };
    if (byRef.some((i) => i.kind === "deposit")) return { kind: "review", reason: "deposit", candidateIds: byRef.map((i) => i.id) };
    const txC = cents(tx.amount);
    if (byRef.length === 1) {
      const rem = cents(byRef[0].remaining);
      const alloc = Math.min(txC, rem); // partial closes only its share; overpayment stays unallocated
      return { kind: "auto", allocations: [{ scheduleId: byRef[0].id, amount: major(alloc) }], unallocated: major(txC - alloc) };
    }
    // Several periods referenced: only automatic when the amount covers all of them exactly.
    const sum = byRef.reduce((a, i) => a + cents(i.remaining), 0);
    if (sum === txC) return { kind: "auto", allocations: byRef.map((i) => ({ scheduleId: i.id, amount: i.remaining })), unallocated: 0 };
    return { kind: "review", reason: "multiple", candidateIds: byRef.map((i) => i.id) };
  }

  // No reference: a known payer IBAN only proposes candidates, never settles by itself.
  const iban = normalizeIban(tx.counterpartyIban);
  const byIban = iban ? open.filter((i) => i.payerIbans.map(normalizeIban).includes(iban)) : [];
  if (byIban.length > 0) return { kind: "review", reason: "no_reference", candidateIds: byIban.map((i) => i.id) };
  return { kind: "none" };
}
