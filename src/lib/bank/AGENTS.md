# Bank matching

- Bank matching: provider-agnostic adapters in src/lib/bank/providers.server.ts (none registered until a real provider is chosen); transactions are read-only imports, settled only via _apply_bank_match/apply_bank_match (booked, same currency, sum <= amount, row lock), undone via unmatch_bank_transaction with reason (payments reversed, never deleted); auto-match off by default and only for unique payment references. Why: no double collections, auditable, safe without a live bank.
