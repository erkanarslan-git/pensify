# WuBook channel manager – Phase 2 plan

Goal: Pensify stays the single source of truth. WuBook is the bridge to Booking.com, Airbnb and Expedia. Availability and prices go out from Pensify; bookings from all three platforms come back in. iCal is removed once WuBook runs.

## What you get
- Per room type: "Publish on Booking.com only" or "Publish on all three".
- A booking from any platform, the website, phone or manual entry closes that room everywhere within about a minute.
- Prices and daily prices from "Zimmertypen & Preise" are pushed to the platforms.
- A "Channels" status page: last sync, errors, retry button.
- Airbnb bookings arrive with full guest data (no more "Airbnb belegt" only).

## Steps
1. **Credentials and account** – you create a WuBook account, connect the three platforms inside WuBook, and give me the API key and property ID (stored as secrets, never in code).
2. **Outbox** – every booking, cancellation, price or availability change writes one row to an `integration_outbox` table in the same database transaction. Nothing is lost if WuBook is down.
3. **Sender** – a scheduled job (every minute) sends pending outbox rows to WuBook, with retries and back-off; failures show on the Channels page.
4. **Room and rate mapping** – on the Channels page, link each room type / rate plan to its WuBook room and choose the publish target (Booking.com only / all three). Uses the existing channel mapping table.
5. **Incoming bookings** – a protected endpoint pulls new/changed/cancelled bookings from WuBook (and accepts its push notifications, signature-checked). Creates reservations with the atomic booking function; a room already taken becomes a conflict alert, never a double booking.
6. **Initial sync** – one-time push of all future availability and prices, then compare WuBook's bookings with Pensify and list differences for you to confirm.
7. **Retire iCal** – after one week without differences, switch off the iCal imports/exports per room.
8. **Tests** – isolation test for the new tables, dry-run mode against WuBook's test property, then go live with one room first.

## Technical details
- New tables (tenant-scoped, RLS, org_id): `integration_outbox` (event, payload, status, attempts, next_attempt_at), `channel_accounts` (org, provider, property code; secret name reference only).
- Triggers on reservations / occupancy_rates / rate_plans enqueue outbox rows; `create_booking_with_reservations` also enqueues.
- Sender: `/api/public/hooks/channel-outbox`, authenticated via private.cron_secrets, loops per active organization, pg_cron every minute.
- WuBook API client in a `*.server.ts` file (fetch-based, Worker-compatible), secrets read inside handlers.
- Room-type level inventory: availability = rooms of that type − overlapping reservations.
- Webhooks stay disabled (403) until the account is configured.

## Needed from you
- WuBook account + API key + property ID (step 1 can be prepared without them; steps 3, 5, 6 need them).
- Confirm: Expedia connected through WuBook too.
