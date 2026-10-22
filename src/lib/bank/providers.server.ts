// Provider-independent bank access layer. No real adapter is registered yet:
// the provider (e.g. finAPI) or EBICS access must be chosen and its official
// documentation followed before adding one. Never invent endpoints here.

export interface ProviderTransaction {
  providerTransactionId: string;
  bookingStatus: "booked" | "pending";
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  remittance: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
}

export interface BankProviderAdapter {
  id: string;
  /** Read-only: returns transactions after the cursor (with overlap for late bookings). */
  fetchTransactions(input: { secretRef: string; providerAccountId: string; cursor: string | null }): Promise<{ transactions: ProviderTransaction[]; nextCursor: string | null }>;
  /** Revokes provider-side consent when the method supports it. */
  revokeAccess?(input: { secretRef: string }): Promise<void>;
}

const adapters: Record<string, BankProviderAdapter> = {};

export class BankNotConfiguredError extends Error {
  constructor() { super("bank_not_configured"); }
}

export function getAdapter(provider: string): BankProviderAdapter {
  const a = adapters[provider];
  if (!a) throw new BankNotConfiguredError();
  return a;
}
