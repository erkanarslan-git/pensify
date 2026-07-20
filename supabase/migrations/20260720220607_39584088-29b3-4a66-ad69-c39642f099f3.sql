
DROP INDEX IF EXISTS public.reservations_channel_room_external_uidx;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_channel_room_external_key
  UNIQUE (channel, room_id, external_id);
