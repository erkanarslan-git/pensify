# Phase: Reservation & Operations UX

Goal: make daily work in the calendar, booking form and operations screens fast and safe, building on the corrected multi-property pricing/channel model. WuBook stays in dry-run mode throughout.

## 1. Calendar (Takvim)
- 30-day view: drag to move/extend a stay, with conflict check before saving; OK/cancel arrows confirm or discard.
- Enter key: opens edit when a booking exists in the focused cell, otherwise opens the new-booking form pre-filled with that room + date.
- Keyboard shortcut help panel (?) listing all shortcuts; calendar grid auto-focuses on page load.
- Past days visually distinct and locked for everyone except Manager/Admin (server-side rule already exists; UI must match).
- Same guest on consecutive days renders as one merged block with full name; room icons get tooltips; "Zimmer" header shows a click hint.

## 2. Booking form (Buchung)
- Fix the broken "New" button.
- Guest count drives the live price quote (per-guest pricing from migration 0012).
- Manual price different from the calculated price requires a reason; discount, author and time are recorded (already enforced server-side — surface it clearly in the form).
- Modal inputs no longer overflow on small screens.

## 3. Operations
- Cleaning (Reinigung): cleaners see only their screen; task flow open → accepted → cleaning → done with server checks (done) — polish the UI states and problem reporting with photos count.
- Reception role: same limited view as cleaner plus arrivals/departures list.
- Room assignment to cleaners: default cleaner per room + daily override from the cleaning board.

## 4. Search & navigation
- Search suggestions across guest / property / room with "G" shortcut to focus.

## 5. Verification
- Production build must pass.
- SQL tests: outbox_cascade.sql (passing), pricing_channels.sql and property_scoping.sql need a privileged runner — sandbox role cannot execute functions or SET ROLE; noted as environment limitation.
- No live WuBook calls; sender remains dry-run.

## Done before this phase
- 0016_outbox_property_cascade_delete: deleting a property now removes its outbox events (verified live: 3 events removed, other property untouched).
